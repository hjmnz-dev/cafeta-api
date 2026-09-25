// Semilla de Cafeta (spec 0002). Idempotente: todo va por upsert con llaves fijas.
// Siempre: carreras y el admin. Con SEED_DEMO=true: la demo del prototipo web.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  PrismaClient,
  type PostType,
  type ProfileVisibility,
  type TagCategory,
} from '../src/generated/prisma/client.js';

const BCRYPT_COST = 12;
const HOUR = 60 * 60 * 1000;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Falta la variable ${name} para la semilla.`);
  }
  return value;
}

/** Lista provisional de carreras de INTEC: pendiente de revisión antes de la demo. */
const CAREERS = [
  'Administración de Empresas',
  'Contabilidad',
  'Economía',
  'Mercadeo',
  'Negocios Internacionales',
  'Ingeniería de Software',
  'Ingeniería en Ciencias de la Computación',
  'Ingeniería en Ciberseguridad',
  'Ingeniería de Sistemas',
  'Ingeniería Industrial',
  'Ingeniería Civil',
  'Ingeniería Eléctrica',
  'Ingeniería Electrónica y de Comunicaciones',
  'Ingeniería Mecánica',
  'Ingeniería Mecatrónica',
  'Ingeniería Biomédica',
  'Biotecnología',
  'Medicina',
  'Psicología',
] as const;

type CareerName = (typeof CAREERS)[number];

/** Ids UUID v7 fijos para que la demo se pueda volver a sembrar sin duplicar. */
const id = (n: number): string =>
  `01926f00-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

interface DemoUser {
  key: string;
  id: string;
  email: string;
  handle: string;
  name: string;
  bio: string;
  career: CareerName | null;
  visibility: ProfileVisibility;
  tags: { label: string; category: TagCategory }[];
}

const DEMO_USERS: DemoUser[] = [
  {
    key: 'carlos',
    id: id(1),
    email: 'cgomez@est.intec.edu.do',
    handle: 'cgomez_intec',
    name: 'Carlos Gómez',
    bio: 'Estudiante de Ingeniería de Software. Apasionado por el desarrollo web y las inteligencias artificiales. 🚀 Buscando compañeros para proyectos.',
    career: 'Ingeniería de Software',
    visibility: 'PUBLIC',
    tags: [
      { label: 'Ing. Software', category: 'CAREER' },
      { label: 'Frontend', category: 'SKILL' },
      { label: 'ReactJS', category: 'SKILL' },
      { label: 'Diseño UI', category: 'INTEREST' },
    ],
  },
  {
    key: 'maria',
    id: id(2),
    email: 'mrodriguez@est.intec.edu.do',
    handle: 'mrodriguez',
    name: 'María Rodríguez',
    bio: 'Estudiante de Medicina. Apuntes, grupos de estudio y café. ☕',
    career: 'Medicina',
    visibility: 'PUBLIC',
    tags: [
      { label: 'Medicina', category: 'CAREER' },
      { label: 'Anatomía', category: 'SKILL' },
    ],
  },
  {
    key: 'juan',
    id: id(3),
    email: 'jperez@est.intec.edu.do',
    handle: 'jperez',
    name: 'Juan Pérez',
    bio: 'Ing. Industrial. Optimizando procesos y horarios de estudio.',
    career: 'Ingeniería Industrial',
    visibility: 'PUBLIC',
    tags: [
      { label: 'Ing. Industrial', category: 'CAREER' },
      { label: 'Lean', category: 'INTEREST' },
    ],
  },
  {
    key: 'laura',
    id: id(4),
    email: 'lbatista@est.intec.edu.do',
    handle: 'lbatista',
    name: 'Laura Batista',
    bio: 'Frontend en formación. Buscando equipo para el proyecto final.',
    career: 'Ingeniería de Software',
    visibility: 'PRIVATE',
    tags: [
      { label: 'Ing. Software', category: 'CAREER' },
      { label: 'React', category: 'SKILL' },
    ],
  },
  {
    key: 'pedro',
    id: id(5),
    email: 'psanchez@est.intec.edu.do',
    handle: 'psanchez',
    name: 'Pedro Sánchez',
    bio: 'Ing. Civil. Estructuras, planos y mucho café.',
    career: 'Ingeniería Civil',
    visibility: 'PUBLIC',
    tags: [{ label: 'Ing. Civil', category: 'CAREER' }],
  },
  {
    key: 'comite',
    id: id(6),
    email: 'comite@est.intec.edu.do',
    handle: 'comite.estudiantes',
    name: 'Comité de Estudiantes',
    bio: 'Actividades y avisos estudiantiles de INTEC.',
    career: null,
    visibility: 'PUBLIC',
    tags: [],
  },
];

interface DemoPost {
  id: string;
  author: string;
  type: PostType;
  content: string;
  hoursAgo: number;
  eventLocation?: string;
  codeSnippet?: string;
  groupName?: string;
  groupSpots?: number;
}

// Las publicaciones de apuntes y PDF del prototipo se siembran como TEXT (sin archivos).
const DEMO_POSTS: DemoPost[] = [
  {
    id: id(101),
    author: 'carlos',
    type: 'TEXT',
    content:
      '¿Alguien más va a la charla de IA de esta tarde en el auditorio? Guardo puesto. 🤖',
    hoursAgo: 0.25,
  },
  {
    id: id(102),
    author: 'juan',
    type: 'TEXT',
    content:
      'Resumen de Cálculo Diferencial para el parcial de mañana. ¡Espero les sirva! 📚',
    hoursAgo: 2,
  },
  {
    id: id(103),
    author: 'maria',
    type: 'TEXT',
    content:
      'Libro de Anatomía Humana en PDF. Lo subo por aquí para quien lo necesite.',
    hoursAgo: 4,
  },
  {
    id: id(104),
    author: 'comite',
    type: 'EVENT',
    content:
      'Gran asamblea de inicio de trimestre en la Plazoleta. ¡Acompáñanos!',
    hoursAgo: 24,
    eventLocation: 'Plazoleta INTEC',
  },
  {
    id: id(105),
    author: 'carlos',
    type: 'CODE',
    content: 'Gente, ¿por qué este loop no termina? 😅 Me da OutOfMemoryError.',
    hoursAgo: 3,
    codeSnippet:
      'function findMax(arr) {\n  let max = arr[0];\n  for(let i=1; i < arr.length; i--) {\n    if(arr[i] > max) max = arr[i];\n  }\n  return max;\n}',
  },
  {
    id: id(106),
    author: 'laura',
    type: 'STUDY_GROUP',
    content:
      'Buscando 2 personas para el proyecto final de Desarrollo Web. Tema: App de delivery en React.',
    hoursAgo: 1,
    groupName: 'Frontend Ninjas',
    groupSpots: 2,
  },
];

const DEMO_STORIES = [
  {
    id: id(201),
    author: 'maria',
    text: 'Maratón de estudio en la biblioteca hasta que cierre. ☕',
    hoursAgo: 1,
  },
  {
    id: id(202),
    author: 'juan',
    text: 'Fila enorme en la cafetería, avisados quedan.',
    hoursAgo: 5,
  },
  {
    id: id(203),
    author: 'laura',
    text: 'Terminamos el prototipo del proyecto final. 🎉',
    hoursAgo: 20,
  },
];

/** Conversaciones con Carlos: [otro usuario, mensajes (true = los envió Carlos)]. */
const DEMO_CONVERSATIONS: [string, [boolean, string][]][] = [
  [
    'maria',
    [
      [false, 'Hola Carlos! ¿Cómo estás?'],
      [true, 'Hola María! Todo bien, estudiando para el examen'],
      [false, '¿Tienes los apuntes de Estructuras de Datos?'],
      [true, 'Sí claro, te los comparto por aquí'],
      [false, 'Muchas gracias! Eres el mejor'],
    ],
  ],
  ['juan', [[false, 'Claro, nos vemos en la biblioteca a las 3']]],
  ['laura', [[false, '¡Gracias por la ayuda con el proyecto!']]],
  ['pedro', [[false, '¿Vamos a estudiar juntos para el examen?']]],
];

/** Carlos sigue a todos los públicos; Laura es privada y queda como solicitud. */
const DEMO_FOLLOWS: [string, string, 'PENDING' | 'ACCEPTED'][] = [
  ['carlos', 'maria', 'ACCEPTED'],
  ['carlos', 'juan', 'ACCEPTED'],
  ['carlos', 'pedro', 'ACCEPTED'],
  ['carlos', 'comite', 'ACCEPTED'],
  ['carlos', 'laura', 'PENDING'],
  ['maria', 'carlos', 'ACCEPTED'],
  ['juan', 'carlos', 'ACCEPTED'],
  ['laura', 'carlos', 'ACCEPTED'],
];

async function seedCareers(prisma: PrismaClient): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const name of CAREERS) {
    const career = await prisma.career.upsert({
      where: { name },
      create: { name },
      update: {},
    });
    ids.set(name, career.id);
  }
  return ids;
}

async function seedAdmin(prisma: PrismaClient): Promise<void> {
  const email = requireEnv('SEED_ADMIN_EMAIL').toLowerCase();
  const password = requireEnv('SEED_ADMIN_PASSWORD');
  if (password.length < 12) {
    throw new Error('SEED_ADMIN_PASSWORD debe tener al menos 12 caracteres.');
  }
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await prisma.user.upsert({
    where: { email },
    create: {
      email,
      passwordHash,
      role: 'ADMIN',
      verificationStatus: 'VERIFIED',
      verifiedAt: new Date(),
      profile: { create: { handle: 'cafeta', displayName: 'Cafeta INTEC' } },
      notificationPreference: { create: {} },
    },
    update: { passwordHash, role: 'ADMIN' },
  });
}

async function seedDemo(
  prisma: PrismaClient,
  careers: Map<string, string>,
): Promise<void> {
  const passwordHash = await bcrypt.hash(
    requireEnv('SEED_DEMO_PASSWORD'),
    BCRYPT_COST,
  );
  const now = Date.now();
  const userId = (key: string): string => {
    const user = DEMO_USERS.find((u) => u.key === key);
    if (!user) throw new Error(`Usuario de demo desconocido: ${key}`);
    return user.id;
  };

  for (const u of DEMO_USERS) {
    const careerId = u.career ? careers.get(u.career) : undefined;
    await prisma.user.upsert({
      where: { id: u.id },
      create: {
        id: u.id,
        email: u.email,
        passwordHash,
        verificationStatus: u.key === 'comite' ? 'VERIFIED' : 'PENDING',
        termsAcceptedAt: new Date(now),
        termsVersion: 'demo',
        profile: {
          create: {
            handle: u.handle,
            displayName: u.name,
            bio: u.bio,
            careerId,
            visibility: u.visibility,
            location: 'Santo Domingo, RD',
            tags: {
              create: u.tags.map((t, position) => ({ ...t, position })),
            },
          },
        },
        notificationPreference: { create: {} },
      },
      update: { passwordHash },
    });
  }

  for (const [follower, following, status] of DEMO_FOLLOWS) {
    const followerId = userId(follower);
    const followingId = userId(following);
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId, followingId } },
      create: {
        followerId,
        followingId,
        status,
        respondedAt: status === 'ACCEPTED' ? new Date(now) : null,
      },
      update: {},
    });
  }

  for (const p of DEMO_POSTS) {
    await prisma.post.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        authorId: userId(p.author),
        type: p.type,
        content: p.content,
        createdAt: new Date(now - p.hoursAgo * HOUR),
        eventStartsAt: p.type === 'EVENT' ? new Date(now + 72 * HOUR) : null,
        eventLocation: p.eventLocation ?? null,
        codeSnippet: p.codeSnippet ?? null,
        groupName: p.groupName ?? null,
        groupSpots: p.groupSpots ?? null,
      },
      update: {},
    });
  }

  // Reacciones y un comentario para que el feed muestre conteos reales.
  const reactions: [string, string][] = [
    [id(101), 'maria'],
    [id(101), 'juan'],
    [id(102), 'carlos'],
    [id(103), 'carlos'],
    [id(106), 'carlos'],
  ];
  for (const [postId, who] of reactions) {
    const uid = userId(who);
    await prisma.postReaction.upsert({
      where: { postId_userId: { postId, userId: uid } },
      create: { postId, userId: uid, type: 'HEART' },
      update: {},
    });
  }
  await prisma.postComment.upsert({
    where: { id: id(301) },
    create: {
      id: id(301),
      postId: id(105),
      authorId: userId('laura'),
      content: 'El i-- nunca llega al final. Cámbialo por i++ 😉',
    },
    update: {},
  });

  // Las historias se refrescan en cada siembra para que sigan vigentes (24 h).
  for (const s of DEMO_STORIES) {
    const createdAt = new Date(now - s.hoursAgo * HOUR);
    const expiresAt = new Date(createdAt.getTime() + 24 * HOUR);
    await prisma.story.upsert({
      where: { id: s.id },
      create: {
        id: s.id,
        authorId: userId(s.author),
        text: s.text,
        createdAt,
        expiresAt,
      },
      update: { createdAt, expiresAt },
    });
  }

  let messageN = 400;
  for (const [n, [other, messages]] of DEMO_CONVERSATIONS.entries()) {
    const [userAId, userBId] = [userId('carlos'), userId(other)].sort();
    const conversationId = id(350 + n);
    const lastAt = new Date(now - (n + 1) * HOUR);
    await prisma.conversation.upsert({
      where: { id: conversationId },
      create: { id: conversationId, userAId, userBId, lastMessageAt: lastAt },
      update: {},
    });
    for (const [i, [byCarlos, content]] of messages.entries()) {
      const messageId = id(++messageN);
      await prisma.message.upsert({
        where: { id: messageId },
        create: {
          id: messageId,
          conversationId,
          senderId: byCarlos ? userId('carlos') : userId(other),
          content,
          createdAt: new Date(
            lastAt.getTime() - (messages.length - 1 - i) * 60_000,
          ),
        },
        update: {},
      });
    }
  }

  // Un reporte pendiente para que la consola admin tenga cola que revisar.
  await prisma.report.upsert({
    where: { id: id(501) },
    create: {
      id: id(501),
      reporterId: userId('maria'),
      targetType: 'POST',
      targetPostId: id(105),
      targetSnapshot: DEMO_POSTS.find((p) => p.id === id(105))?.content,
      reason: 'SPAM',
      details: 'Publicación de prueba para la demo.',
      pendingKey: `POST:${id(105)}`,
    },
    update: {},
  });

  // La bitácora solo acepta inserciones: se agregan sin tocar las existentes.
  await prisma.auditLog.createMany({
    data: [
      {
        id: id(601),
        actorId: userId('carlos'),
        actorRole: 'STUDENT',
        action: 'post.create',
        entityType: 'post',
        entityId: id(101),
        succeeded: true,
      },
      {
        id: id(602),
        actorId: userId('pedro'),
        actorRole: 'STUDENT',
        action: 'access.denied',
        entityType: 'route',
        succeeded: false,
        metadata: { route: '/admin' },
      },
    ],
    skipDuplicates: true,
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: requireEnv('DIRECT_URL') }),
  });
  try {
    const careers = await seedCareers(prisma);
    await seedAdmin(prisma);
    const demo = process.env.SEED_DEMO === 'true';
    if (demo) await seedDemo(prisma, careers);
    console.log(
      demo
        ? 'Semilla lista: carreras, admin y demo.'
        : 'Semilla lista: carreras y admin.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
