import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { resetDb } from './support/reset-db.js';

// Búsqueda y descubrimiento (spec 0008, decisión 28; HU40, HU41 y HU42) contra
// PostgreSQL real, con unaccent y pg_trgm de la migración.
const PASSWORD = 'clave-segura-2026';
const DAY = 24 * 60 * 60 * 1000;

interface Account {
  id: string;
  token: string;
}

describe('Búsqueda y descubrimiento (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let careerId: string;
  let otherCareerId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDb(prisma);
    careerId = (
      await prisma.career.create({ data: { name: 'Ingeniería de Software' } })
    ).id;
    otherCareerId = (await prisma.career.create({ data: { name: 'Medicina' } }))
      .id;
  });

  const signUp = async (
    handle: string,
    firstName = handle,
    lastName = 'Prueba',
    career = careerId,
  ): Promise<Account> => {
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: `${handle}@est.intec.edu.do`,
        password: PASSWORD,
        firstName,
        lastName,
        handle,
        careerId: career,
        acceptTerms: true,
      })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  };

  const get = (account: Account, path: string) =>
    request(server)
      .get(`/api/v1${path}`)
      .set('Authorization', `Bearer ${account.token}`);

  const post = (
    author: Account,
    content: string,
    extra: Record<string, unknown> = {},
  ) =>
    prisma.post.create({
      data: { authorId: author.id, type: 'TEXT', content, ...extra },
    });

  const handles = async (account: Account, query: string) =>
    (
      await get(account, `/search/users?q=${encodeURIComponent(query)}`).expect(
        200,
      )
    ).body.items.map((u: { handle: string }) => u.handle);

  const postTexts = async (account: Account, path: string) =>
    (await get(account, path).expect(200)).body.items.map(
      (p: { content: string }) => p.content,
    );

  it('AC-1 (HU41 E1): busca personas por nombre ignorando mayúsculas y acentos', async () => {
    const ana = await signUp('ana');
    await signUp('jose1', 'José', 'Pérez');
    await signUp('maria1', 'María', 'López');

    expect(await handles(ana, 'jose')).toEqual(['jose1']);
    expect(await handles(ana, 'JOSÉ')).toEqual(['jose1']);
    expect(await handles(ana, 'perez')).toEqual(['jose1']);
    expect(await handles(ana, 'maria lopez')).toEqual(['maria1']);
    const res = await get(ana, '/search/users?q=jose').expect(200);
    expect(res.body.items[0]).toMatchObject({
      displayName: 'José Pérez',
      careerName: 'Ingeniería de Software',
      verified: false,
    });
  });

  it('AC-1: busca personas por nombre de carrera y por usuario', async () => {
    const ana = await signUp('ana');
    await signUp('beto', 'Beto', 'Díaz', careerId);
    await signUp('carla', 'Carla', 'Peña', otherCareerId);

    expect(await handles(ana, 'software')).toEqual(['beto']);
    expect(await handles(ana, 'MEDICINA')).toEqual(['carla']);
    expect(await handles(ana, 'carla')).toEqual(['carla']);
  });

  it('AC-2 (HU41 E2): sin coincidencias la lista viene vacía', async () => {
    const ana = await signUp('ana');
    const res = await get(ana, '/search/users?q=zzzzqq').expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('AC-3: la consulta necesita 2 caracteres y los comodines son texto', async () => {
    const ana = await signUp('ana');
    await signUp('beto', 'Beto', 'Díaz');
    const short = await get(ana, '/search/users?q=%20a%20').expect(400);
    expect(short.body.code).toBe('VALIDATION_ERROR');
    await get(ana, '/search/users').expect(400);
    await get(ana, `/search/posts?q=${'x'.repeat(101)}`).expect(400);
    // "%%" y "__" no son patrones: no encuentran a todo el mundo.
    expect(await handles(ana, '%%')).toEqual([]);
    expect(await handles(ana, '__')).toEqual([]);
  });

  it('AC-4: no aparecen quien busca, cuentas desactivadas ni bloqueos; las cuentas privadas sí', async () => {
    const ana = await signUp('ana', 'Ana', 'Tester');
    const beto = await signUp('beto', 'Beto', 'Tester');
    const carla = await signUp('carla', 'Carla', 'Tester');
    const dani = await signUp('dani', 'Dani', 'Tester');
    const eli = await signUp('eli', 'Eli', 'Tester');
    await prisma.user.update({
      where: { id: beto.id },
      data: { deactivatedAt: new Date() },
    });
    await prisma.block.create({
      data: { blockerId: ana.id, blockedId: carla.id },
    });
    await prisma.block.create({
      data: { blockerId: dani.id, blockedId: ana.id },
    });
    await prisma.profile.update({
      where: { userId: eli.id },
      data: { visibility: 'PRIVATE' },
    });

    expect(await handles(ana, 'tester')).toEqual(['eli']);
  });

  it('bug 1015: cada persona trae el seguimiento de quien busca y si se le puede seguir', async () => {
    const ana = await signUp('ana', 'Ana', 'Tester');
    const beto = await signUp('beto', 'Beto', 'Tester');
    const carla = await signUp('carla', 'Carla', 'Tester');
    const dani = await signUp('dani', 'Dani', 'Tester');
    const eli = await signUp('eli', 'Eli', 'Tester');
    await prisma.follow.create({
      data: { followerId: ana.id, followingId: beto.id, status: 'ACCEPTED' },
    });
    await prisma.follow.create({
      data: { followerId: ana.id, followingId: carla.id, status: 'PENDING' },
    });
    // Un seguimiento dado de baja ya no cuenta.
    await prisma.follow.create({
      data: {
        followerId: ana.id,
        followingId: dani.id,
        status: 'ACCEPTED',
        deactivatedAt: new Date(),
      },
    });
    await prisma.profile.update({
      where: { userId: eli.id },
      data: { visibility: 'PRIVATE' },
    });

    const res = await get(ana, '/search/users?q=tester').expect(200);
    const byHandle = Object.fromEntries(
      res.body.items.map(
        (u: { handle: string; followStatus: string; canFollow: boolean }) => [
          u.handle,
          { followStatus: u.followStatus, canFollow: u.canFollow },
        ],
      ),
    );
    expect(byHandle).toEqual({
      beto: { followStatus: 'ACCEPTED', canFollow: true },
      carla: { followStatus: 'PENDING', canFollow: true },
      dani: { followStatus: 'NONE', canFollow: true },
      eli: { followStatus: 'NONE', canFollow: false },
    });
  });

  it('Descubrir (bugs 1031 y 1033): sugiere personas reales que aún no sigo, primero las de mi carrera', async () => {
    const ana = await signUp('ana', 'Ana', 'Tester');
    const beto = await signUp('beto', 'Beto', 'Tester');
    const carla = await signUp('carla', 'Carla', 'Tester', otherCareerId);
    const dani = await signUp('dani', 'Dani', 'Tester');
    const eli = await signUp('eli', 'Eli', 'Tester');
    const fede = await signUp('fede', 'Fede', 'Tester');
    const gabi = await signUp('gabi', 'Gabi', 'Tester');
    const admin = await signUp('admin', 'Admin', 'Tester');
    const hugo = await signUp('hugo', 'Hugo', 'Tester');
    await prisma.follow.create({
      data: { followerId: ana.id, followingId: dani.id, status: 'ACCEPTED' },
    });
    await prisma.follow.create({
      data: { followerId: ana.id, followingId: eli.id, status: 'PENDING' },
    });
    await prisma.block.create({
      data: { blockerId: fede.id, blockedId: ana.id },
    });
    await prisma.user.update({
      where: { id: gabi.id },
      data: { deactivatedAt: new Date() },
    });
    await prisma.user.update({
      where: { id: admin.id },
      data: { role: 'ADMIN' },
    });

    const res = await get(ana, '/discover/people').expect(200);
    expect(res.body.items.map((u: { handle: string }) => u.handle)).toEqual([
      'hugo',
      'beto',
      'carla',
    ]);
    expect(res.body.items[0]).toMatchObject({
      followStatus: 'NONE',
      canFollow: true,
    });

    const first = await get(ana, '/discover/people?limit=2').expect(200);
    expect(first.body.items.map((u: { id: string }) => u.id)).toEqual([
      hugo.id,
      beto.id,
    ]);
    const second = await get(
      ana,
      `/discover/people?limit=2&cursor=${first.body.nextCursor}`,
    ).expect(200);
    expect(second.body.items.map((u: { id: string }) => u.id)).toEqual([
      carla.id,
    ]);
    expect(second.body.nextCursor).toBeNull();
    const bad = await get(ana, `/discover/people?cursor=${dani.id}`).expect(
      400,
    );
    expect(bad.body.code).toBe('INVALID_CURSOR');
    await request(server).get('/api/v1/discover/people').expect(401);
  });

  it('AC-5: pagina por cursor sin repetir ni saltar, y rechaza un cursor ajeno', async () => {
    const ana = await signUp('ana');
    for (const n of ['uno', 'dos', 'tres', 'cuatro', 'cinco']) {
      await signUp(`${n}1`, `Usuario ${n}`, 'Lista');
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `&cursor=${cursor}&limit=2` : '&limit=2';
      const res = await get(ana, `/search/users?q=lista${query}`).expect(200);
      seen.push(...res.body.items.map((u: { handle: string }) => u.handle));
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    const bad = await get(ana, `/search/users?q=lista&cursor=${ana.id}`).expect(
      400,
    );
    expect(bad.body.code).toBe('INVALID_CURSOR');
  }, 30_000);
  it('AC-6 (HU42 E1): busca publicaciones por texto sin acentos, de la más reciente a la más antigua', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    await post(beto, 'Examen de álgebra el lunes', {
      createdAt: new Date(Date.now() - 2 * DAY),
    });
    await post(beto, 'Repaso de ALGEBRA lineal');
    await post(beto, 'Nada que ver con esto');

    expect(await postTexts(ana, '/search/posts?q=algebra')).toEqual([
      'Repaso de ALGEBRA lineal',
      'Examen de álgebra el lunes',
    ]);
    expect(await postTexts(ana, '/search/posts?q=algebra%20lunes')).toEqual([
      'Examen de álgebra el lunes',
    ]);
  });

  it('AC-7 (HU42 E2): sin coincidencias la lista viene vacía', async () => {
    const ana = await signUp('ana');
    const res = await get(ana, '/search/posts?q=zzzzqq').expect(200);
    expect(res.body).toEqual({ items: [], nextCursor: null });
  });

  it('AC-8: las publicaciones respetan archivado, baja, privacidad y bloqueos', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    const dani = await signUp('dani');
    const eli = await signUp('eli');
    await post(beto, 'tema visible beto');
    await post(beto, 'tema archivada', { archivedAt: new Date() });
    await post(beto, 'tema desactivada', { deactivatedAt: new Date() });
    await post(carla, 'tema carla privada');
    await post(dani, 'tema dani bloqueada');
    await post(eli, 'tema eli solo seguidores');
    await prisma.profile.update({
      where: { userId: carla.id },
      data: { visibility: 'PRIVATE' },
    });
    await prisma.profile.update({
      where: { userId: eli.id },
      data: { visibility: 'FOLLOWERS' },
    });
    await prisma.block.create({
      data: { blockerId: ana.id, blockedId: dani.id },
    });

    expect(await postTexts(ana, '/search/posts?q=tema')).toEqual([
      'tema visible beto',
    ]);

    await prisma.follow.create({
      data: { followerId: ana.id, followingId: eli.id, status: 'ACCEPTED' },
    });
    expect(await postTexts(ana, '/search/posts?q=tema')).toEqual([
      'tema eli solo seguidores',
      'tema visible beto',
    ]);
    await prisma.user.update({
      where: { id: beto.id },
      data: { deactivatedAt: new Date() },
    });
    expect(await postTexts(ana, '/search/posts?q=tema')).toEqual([
      'tema eli solo seguidores',
    ]);
  });

  it('AC-9 (HU40 E1): explorar pone primero lo reciente más movido, no incluye lo mío y respeta la visibilidad', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const carla = await signUp('carla');
    await post(ana, 'mía');
    await post(beto, 'reciente sin movimiento');
    const popular = await post(beto, 'reciente popular');
    const comentada = await post(beto, 'reciente comentada');
    await post(beto, 'antigua popular', {
      createdAt: new Date(Date.now() - 10 * DAY),
    });
    await post(carla, 'privada', {});
    await prisma.profile.update({
      where: { userId: carla.id },
      data: { visibility: 'PRIVATE' },
    });
    await prisma.postReaction.create({
      data: { postId: popular.id, userId: carla.id, type: 'HEART' },
    });
    await prisma.postReaction.create({
      data: { postId: popular.id, userId: beto.id, type: 'HEART' },
    });
    await prisma.postComment.create({
      data: { postId: comentada.id, authorId: carla.id, content: 'hola' },
    });

    expect(await postTexts(ana, '/explore/posts')).toEqual([
      'reciente popular',
      'reciente comentada',
      'reciente sin movimiento',
      'antigua popular',
    ]);
  });

  it('AC-10: explorar completa con lo más reciente cuando hay poco, y sin contenido viene vacío (HU40 E2)', async () => {
    const ana = await signUp('ana');
    const empty = await get(ana, '/explore/posts').expect(200);
    expect(empty.body).toEqual({ items: [], nextCursor: null });

    const beto = await signUp('beto');
    await post(beto, 'de hace un mes', {
      createdAt: new Date(Date.now() - 30 * DAY),
    });
    await post(beto, 'de hace dos meses', {
      createdAt: new Date(Date.now() - 60 * DAY),
    });
    expect(await postTexts(ana, '/explore/posts')).toEqual([
      'de hace un mes',
      'de hace dos meses',
    ]);
  });

  it('AC-11: explorar pagina por cursor sin repetir', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    for (let i = 0; i < 5; i++) await post(beto, `publicación ${i}`);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor ? `?cursor=${cursor}&limit=2` : '?limit=2';
      const res = await get(ana, `/explore/posts${query}`).expect(200);
      seen.push(...res.body.items.map((p: { id: string }) => p.id));
      cursor = res.body.nextCursor;
    } while (cursor);
    expect(new Set(seen).size).toBe(5);
  });

  it('sin token las rutas de búsqueda responden 401', async () => {
    await request(server).get('/api/v1/search/users?q=ana').expect(401);
    await request(server).get('/api/v1/search/posts?q=ana').expect(401);
    await request(server).get('/api/v1/explore/posts').expect(401);
  });
});
