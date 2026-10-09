import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/app.setup.js';
import { MediaStorage } from '../src/modules/uploads/media-storage.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { MemoryMediaStorage } from './support/memory-media-storage.js';
import { resetDb } from './support/reset-db.js';

// Ver y editar el perfil (funcionalidad 14, HU09 y HU10) contra PostgreSQL real.
const PASSWORD = 'clave-segura-2026';
const PNG = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d,
]);
const PDF = Buffer.from('%PDF-1.7\n%fin');

interface Account {
  id: string;
  token: string;
}

describe('Ver y editar perfil (e2e)', () => {
  let app: NestExpressApplication;
  let server: App;
  let prisma: PrismaService;
  let storage: MemoryMediaStorage;
  let careerId: string;
  let otherCareerId: string;

  beforeAll(async () => {
    storage = new MemoryMediaStorage();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MediaStorage)
      .useValue(storage)
      .compile();
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
    storage.objects.clear();
    careerId = (
      await prisma.career.create({ data: { name: 'Ingeniería de Software' } })
    ).id;
    otherCareerId = (await prisma.career.create({ data: { name: 'Medicina' } }))
      .id;
  });

  const signUp = async (handle: string): Promise<Account> => {
    const res = await request(server)
      .post('/api/v1/auth/register')
      .send({
        email: `${handle}@est.intec.edu.do`,
        password: PASSWORD,
        firstName: handle,
        lastName: 'Prueba',
        handle,
        careerId,
        acceptTerms: true,
      })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  };

  const edit = (account: Account, body: object) =>
    request(server)
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${account.token}`)
      .set('User-Agent', 'cafeta-e2e')
      .send(body);

  const view = (viewer: Account, userId: string) =>
    request(server)
      .get(`/api/v1/users/${userId}/profile`)
      .set('Authorization', `Bearer ${viewer.token}`);

  const uploadFile = async (account: Account, data: Buffer, name: string) => {
    const res = await request(server)
      .post('/api/v1/uploads')
      .set('Authorization', `Bearer ${account.token}`)
      .attach('file', data, name)
      .expect(201);
    return res.body.key as string;
  };

  it('HU10: edita nombre, bio, carrera, ubicación y etiquetas, y el perfil público lo refleja', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');

    const res = await edit(ana, {
      displayName: '  Ana María  ',
      bio: 'Me gusta programar',
      careerId: otherCareerId,
      location: 'Santo Domingo',
      tags: [
        { label: 'React', category: 'SKILL' },
        { label: 'Música', category: 'INTEREST' },
      ],
    }).expect(200);

    expect(res.body).toMatchObject({
      displayName: 'Ana María',
      bio: 'Me gusta programar',
      careerId: otherCareerId,
      careerName: 'Medicina',
      location: 'Santo Domingo',
      isSelf: true,
      tags: [
        { label: 'React', category: 'SKILL' },
        { label: 'Música', category: 'INTEREST' },
      ],
    });
    const seenByBeto = await view(beto, ana.id).expect(200);
    expect(seenByBeto.body).toMatchObject({
      displayName: 'Ana María',
      bio: 'Me gusta programar',
      careerName: 'Medicina',
      tags: [{ label: 'React' }, { label: 'Música' }],
    });
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'profile.update', entityId: ana.id },
    });
    expect(audit).not.toBeNull();
  });

  it('una edición parcial no toca lo demás, y las etiquetas nuevas reemplazan a las viejas', async () => {
    const ana = await signUp('ana');
    await edit(ana, {
      bio: 'Hola',
      tags: [{ label: 'React', category: 'SKILL' }],
    }).expect(200);

    const res = await edit(ana, {
      tags: [{ label: 'Docker', category: 'SKILL' }],
    }).expect(200);

    expect(res.body.bio).toBe('Hola');
    expect(res.body.displayName).toBe('ana Prueba');
    expect(res.body.tags).toEqual([{ label: 'Docker', category: 'SKILL' }]);
  });

  it('bio y ubicación se pueden vaciar con null o con texto en blanco', async () => {
    const ana = await signUp('ana');
    await edit(ana, { bio: 'Hola', location: 'Santiago' }).expect(200);

    const res = await edit(ana, { bio: '   ', location: null }).expect(200);

    expect(res.body.bio).toBeNull();
    expect(res.body.location).toBeNull();
  });

  it('HU10 E2: guardar con el nombre vacío se rechaza y no cambia nada', async () => {
    const ana = await signUp('ana');

    await edit(ana, { displayName: '   ' }).expect(400);
    await edit(ana, { displayName: '' }).expect(400);

    const res = await view(ana, ana.id).expect(200);
    expect(res.body.displayName).toBe('ana Prueba');
  });

  it('rechaza una bio de más de 160 caracteres, etiquetas repetidas o de más, y una carrera inexistente', async () => {
    const ana = await signUp('ana');

    await edit(ana, { bio: 'x'.repeat(161) }).expect(400);
    const dup = await edit(ana, {
      tags: [
        { label: 'React', category: 'SKILL' },
        { label: 'react', category: 'INTEREST' },
      ],
    }).expect(400);
    expect(dup.body.code).toBe('TAG_DUPLICATED');
    const tooMany = Array.from({ length: 13 }, (_, i) => ({
      label: `t${i}`,
      category: 'SKILL',
    }));
    await edit(ana, { tags: tooMany }).expect(400);
    const career = await edit(ana, {
      careerId: '0192f0c4-7d1a-7c3e-9a51-3c2b8e1f4a10',
    }).expect(400);
    expect(career.body.code).toBe('CAREER_NOT_FOUND');
    await edit(ana, { handle: 'otro' }).expect(400);
  });

  it('la foto: se sube, se guarda y se ve en el perfil; cambiarla borra la anterior; null la quita', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const first = await uploadFile(ana, PNG, 'a.png');

    const res = await edit(ana, { avatarKey: first }).expect(200);
    expect(res.body.avatarUrl).toContain(`https://blob.test/media/${first}`);
    const seen = await view(beto, ana.id).expect(200);
    expect(seen.body.avatarUrl).toContain(first);

    const second = await uploadFile(ana, PNG, 'b.png');
    await edit(ana, { avatarKey: second }).expect(200);
    expect(storage.objects.has(first)).toBe(false);
    expect(storage.objects.has(second)).toBe(true);

    const cleared = await edit(ana, { avatarKey: null }).expect(200);
    expect(cleared.body.avatarUrl).toBeNull();
    expect(storage.objects.has(second)).toBe(false);
  });

  it('rechaza una foto ajena, inexistente o que no es imagen', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const ofBeto = await uploadFile(beto, PNG, 'b.png');
    const pdf = await uploadFile(ana, PDF, 'a.pdf');

    for (const avatarKey of [
      ofBeto,
      pdf,
      'image/0192f0c4-7d1a-4c3e-9a51-3c2b8e1f4a10.png',
    ]) {
      const res = await edit(ana, { avatarKey }).expect(400);
      expect(res.body.code).toBe('MEDIA_NOT_FOUND');
    }
  });

  it('HU09: el perfil limitado de un FOLLOWERS muestra la foto y la carrera pero no la ubicación', async () => {
    const ana = await signUp('ana');
    const beto = await signUp('beto');
    const key = await uploadFile(ana, PNG, 'a.png');
    await edit(ana, { avatarKey: key, location: 'Santiago', bio: 'Hola' });
    await prisma.profile.update({
      where: { userId: ana.id },
      data: { visibility: 'FOLLOWERS' },
    });

    const res = await view(beto, ana.id).expect(200);

    expect(res.body.canSeeContent).toBe(false);
    expect(res.body.avatarUrl).toContain(key);
    expect(res.body.careerName).toBe('Ingeniería de Software');
    expect(res.body.location).toBeNull();
    expect(res.body.bio).toBeNull();
  });

  it('exige sesión', async () => {
    await request(server).patch('/api/v1/me/profile').send({}).expect(401);
  });
});
