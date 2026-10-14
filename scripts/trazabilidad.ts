// Matriz de trazabilidad HU, escenario, prueba (spec 0008, decisión 37).
//
// Lee los escenarios Gherkin de `project-context.md` y busca en las pruebas de
// los tres repos las que llevan su id en el nombre (`HU03 E2: enlace vencido`).
// Escribe `docs/trazabilidad.md`. Las funciones de arriba son puras y tienen su
// prueba; `main()` solo lee y escribe archivos.
//
//   npm run trazabilidad                  genera la matriz
//   npm run trazabilidad -- --check       falla si falta una prueba o sobra un id
//
// Rutas por defecto (la disposición del espacio de trabajo): `../Cafeta`,
// `../Cafeta-Admin`, `../project-context.md` y `../docs/trazabilidad.md`.
// Se cambian con `--web=`, `--admin=`, `--context=` y `--out=`.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export type Repo = 'api' | 'web' | 'admin';

export interface Scenario {
  hu: string;
  huTitle: string;
  id: string;
  title: string;
}

export interface FoundTest {
  hu: string;
  scenario: string;
  title: string;
  repo: Repo;
  file: string;
}

export interface Report {
  scenarios: Scenario[];
  tests: FoundTest[];
  missing: Scenario[];
  unknown: FoundTest[];
}

const HU_HEADING = /^###\s+(HU\d+)\s*[-–]\s*(.+?)\s*\(ID/;
const SCENARIO = /\*\*Escenario\s+(\d+)\s*:\s*(.*?)\*\*/;
const SECTION_END = /^##\s+(FT00|Lo que no está definido)/;
const TEST_NAME =
  /\b(?:it|test)(?:\.(?:skip|only|concurrent))?\(\s*(['"`])(HU\d{2}) (E\d+(?:\s+y\s+E\d+)*): ((?:\\.|(?!\1)[^\\\n])*)\1/g;

const padHu = (hu: string): string => `HU${hu.slice(2).padStart(2, '0')}`;

/** Los escenarios de cada HU, en el orden en que aparecen en el documento. */
export function parseScenarios(markdown: string): Scenario[] {
  const scenarios: Scenario[] = [];
  let current: { hu: string; title: string } | null = null;
  for (const line of markdown.split('\n')) {
    // FT00 guarda las HU removidas: de ahí en adelante no hay escenarios vivos.
    if (SECTION_END.test(line)) break;
    const heading = HU_HEADING.exec(line);
    if (heading) {
      current = { hu: padHu(heading[1]), title: heading[2].trim() };
      continue;
    }
    const scenario = SCENARIO.exec(line);
    if (current && scenario) {
      scenarios.push({
        hu: current.hu,
        huTitle: current.title,
        id: `E${scenario[1]}`,
        title: scenario[2].trim(),
      });
    }
  }
  return scenarios;
}

/**
 * Las pruebas de un archivo cuyo nombre empieza con `HUnn En:`. Una prueba que
 * cubre dos escenarios lo dice con `HUnn E1 y E2:` y cuenta para los dos.
 */
export function findTests(
  source: string,
  file: string,
  repo: Repo,
): FoundTest[] {
  return [...source.matchAll(TEST_NAME)].flatMap((m) =>
    [...m[3].matchAll(/E\d+/g)].map((id) => ({
      hu: m[2],
      scenario: id[0],
      title: m[4].trim(),
      repo,
      file,
    })),
  );
}

export function buildReport(scenarios: Scenario[], tests: FoundTest[]): Report {
  const key = (hu: string, id: string) => `${hu} ${id}`;
  const known = new Set(scenarios.map((s) => key(s.hu, s.id)));
  const covered = new Set(tests.map((t) => key(t.hu, t.scenario)));
  return {
    scenarios,
    tests,
    missing: scenarios.filter((s) => !covered.has(key(s.hu, s.id))),
    unknown: tests.filter((t) => !known.has(key(t.hu, t.scenario))),
  };
}

const cell = (text: string): string => text.replace(/\|/g, '\\|');

// Diferencias entre el documento de HU y el sistema que quien lee la matriz
// debe conocer. Se dejan aquí, junto al generador, para que no se pierdan.
const NOTES = [
  'En `project-context.md` los escenarios de HU24 y HU25 describen anuncios institucionales y guardar publicaciones, aunque los títulos de esas HU digan comentar y reaccionar. Las pruebas siguen los escenarios; los comentarios y las reacciones a publicaciones están en HU28 a HU31.',
  'HU40 E1 y HU42 E1 hablan de publicaciones e historias. Hoy explorar y buscar contenido devuelven publicaciones; las historias no entran en esas dos listas.',
  'El historial de HU38 E1 lo entrega la API del más reciente al más antiguo; la pantalla lo muestra en orden cronológico (prueba HU38 E1 de la web).',
];

export function renderMarkdown(report: Report, date: string): string {
  const { scenarios, tests, missing, unknown } = report;
  const done = scenarios.length - missing.length;
  const pct = scenarios.length
    ? Math.round((done / scenarios.length) * 100)
    : 0;
  const lines = [
    '# Matriz de trazabilidad: historia, escenario y prueba',
    '',
    `Generada por \`npm run trazabilidad\` (en \`cafeta-api\`) el ${date}. No se edita a mano: se vuelve a generar.`,
    '',
    `**Cobertura:** ${done} de ${scenarios.length} escenarios Gherkin tienen prueba (${pct} %), con ${tests.length} pruebas en total. Cada prueba lleva su id en el nombre, por ejemplo \`HU03 E2: ...\` (spec 0008, decisión 37).`,
    '',
    '| HU | Historia | Escenario | Prueba | Repo | Archivo |',
    '|---|---|---|---|---|---|',
  ];
  lines.splice(6, 0, '**Notas:**', '', ...NOTES.map((note) => `- ${note}`), '');
  for (const s of scenarios) {
    const found = tests.filter((t) => t.hu === s.hu && t.scenario === s.id);
    const scenario = `${s.id}: ${cell(s.title)}`;
    if (found.length === 0) {
      lines.push(
        `| ${s.hu} | ${cell(s.huTitle)} | ${scenario} | **SIN PRUEBA** | | |`,
      );
      continue;
    }
    for (const t of found) {
      lines.push(
        `| ${s.hu} | ${cell(s.huTitle)} | ${scenario} | ${cell(t.title)} | ${t.repo} | \`${t.file}\` |`,
      );
    }
  }
  if (missing.length > 0) {
    lines.push('', '## Escenarios sin prueba', '');
    for (const s of missing) lines.push(`- ${s.hu} ${s.id}: ${s.title}`);
  }
  if (unknown.length > 0) {
    lines.push(
      '',
      '## Pruebas con un id que no está en el documento de HU',
      '',
    );
    for (const t of unknown) {
      lines.push(`- ${t.hu} ${t.scenario}: ${t.title} (\`${t.file}\`)`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

// Bordes: todo lo de abajo toca el disco.

const IGNORED = /(^|[\\/])(node_modules|dist|\.git|generated)([\\/]|$)/;

function listFiles(dir: string, pattern: RegExp): string[] {
  try {
    return readdirSync(dir, { recursive: true, encoding: 'utf8' })
      .filter((f) => !IGNORED.test(f) && pattern.test(f))
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

function collectTests(
  repo: Repo,
  dir: string,
  pattern: RegExp,
): { tests: FoundTest[]; files: number } {
  const files = listFiles(dir, pattern);
  const tests = files.flatMap((full) =>
    findTests(
      readFileSync(full, 'utf8'),
      relative(dir, full).replace(/\\/g, '/'),
      repo,
    ),
  );
  return { tests, files: files.length };
}

function option(name: string, fallback: string): string {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return resolve(arg ? arg.slice(name.length + 3) : fallback);
}

function main(): void {
  const api = resolve(import.meta.dirname, '..');
  const web = option('web', join(api, '..', 'Cafeta'));
  const admin = option('admin', join(api, '..', 'Cafeta-Admin'));
  const context = option('context', join(api, '..', 'project-context.md'));
  const out = option('out', join(api, '..', 'docs', 'trazabilidad.md'));
  const check = process.argv.includes('--check');

  const scenarios = parseScenarios(readFileSync(context, 'utf8'));
  if (scenarios.length === 0) {
    console.error(`No encontré escenarios Gherkin en ${context}`);
    process.exit(1);
  }
  const sources = [
    collectTests('api', join(api, 'test'), /\.e2e-spec\.ts$/),
    collectTests('web', join(web, 'src'), /\.test\.tsx?$/),
    collectTests('admin', join(admin, 'src'), /\.test\.tsx?$/),
  ];
  const repos: Repo[] = ['api', 'web', 'admin'];
  sources.forEach((s, i) => {
    if (s.files === 0) {
      console.warn(`Aviso: no hay pruebas en el repo ${repos[i]}`);
    }
  });
  const report = buildReport(
    scenarios,
    sources.flatMap((s) => s.tests),
  );
  const date = new Date().toISOString().slice(0, 10);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, renderMarkdown(report, date), 'utf8');

  const done = scenarios.length - report.missing.length;
  console.log(
    `Trazabilidad: ${done} de ${scenarios.length} escenarios con prueba, ${report.tests.length} pruebas. Escrita en ${out}`,
  );
  if (check && (report.missing.length > 0 || report.unknown.length > 0)) {
    console.error(
      `Faltan ${report.missing.length} escenarios y sobran ${report.unknown.length} ids desconocidos.`,
    );
    process.exit(1);
  }
}

if (import.meta.main) main();
