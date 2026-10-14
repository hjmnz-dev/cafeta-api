import {
  buildReport,
  findTests,
  parseScenarios,
  renderMarkdown,
} from './trazabilidad.js';

const CONTEXT = `
### HU03 - Recuperar contraseña (ID 379, estado en Azure DevOps: New)

**Escenario 1: Solicitud exitosa**

**Dado:** algo

**Escenario 2: Correo no registrado**

### HU10 - Editar perfil (ID 192, estado en Azure DevOps: Done)

*   **Escenario 1: Edición exitosa**

    **Escenario 2: Campo obligatorio vacío**

## FT00 - HUs removidas (ID 422)

### HU07 - Removida (ID 1, estado en Azure DevOps: Removed)

**Escenario 1: No debe contarse**
`;

describe('parseScenarios', () => {
  it('lee los escenarios de cada HU, también con el formato de lista', () => {
    expect(parseScenarios(CONTEXT)).toEqual([
      {
        hu: 'HU03',
        huTitle: 'Recuperar contraseña',
        id: 'E1',
        title: 'Solicitud exitosa',
      },
      {
        hu: 'HU03',
        huTitle: 'Recuperar contraseña',
        id: 'E2',
        title: 'Correo no registrado',
      },
      {
        hu: 'HU10',
        huTitle: 'Editar perfil',
        id: 'E1',
        title: 'Edición exitosa',
      },
      {
        hu: 'HU10',
        huTitle: 'Editar perfil',
        id: 'E2',
        title: 'Campo obligatorio vacío',
      },
    ]);
  });
});

describe('findTests', () => {
  it('encuentra los nombres con id en comillas simples, dobles y plantilla', () => {
    const source = `
      it('HU03 E1: envía el enlace', async () => {});
      it(
        "HU03 E2: no revela si existe",
        async () => {},
      );
      test(\`HU10 E1: guarda\`, () => {});
      it('sin id: no cuenta', () => {});
      describe('HU03 Recuperar contraseña', () => {});
    `;
    const found = findTests(source, 'a.e2e-spec.ts', 'api');
    expect(found.map((t) => `${t.hu} ${t.scenario}: ${t.title}`)).toEqual([
      'HU03 E1: envía el enlace',
      'HU03 E2: no revela si existe',
      'HU10 E1: guarda',
    ]);
    expect(found[0]).toMatchObject({ repo: 'api', file: 'a.e2e-spec.ts' });
  });

  it('una prueba con `E1 y E2` cuenta para los dos escenarios', () => {
    const found = findTests(
      `it('HU07 E1 y E2: guarda y persiste', () => {});`,
      'p.e2e-spec.ts',
      'api',
    );
    expect(found.map((t) => t.scenario)).toEqual(['E1', 'E2']);
    expect(found[0].title).toBe('guarda y persiste');
  });

  it('acepta comillas del otro tipo dentro del nombre', () => {
    const [test] = findTests(
      `it('HU05 E1: pide "Desactivar cuenta" y confirma', () => {});`,
      'x.test.tsx',
      'web',
    );
    expect(test.title).toBe('pide "Desactivar cuenta" y confirma');
  });
});

describe('buildReport y renderMarkdown', () => {
  const scenarios = parseScenarios(CONTEXT);
  const tests = [
    ...findTests(`it('HU03 E1: a', () => {});`, 'a.ts', 'api'),
    ...findTests(`it('HU03 E1: b | con barra', () => {});`, 'b.ts', 'web'),
    ...findTests(`it('HU99 E1: huérfana', () => {});`, 'c.ts', 'admin'),
  ];
  const report = buildReport(scenarios, tests);

  it('separa lo que falta de lo que sobra', () => {
    expect(report.missing.map((s) => `${s.hu} ${s.id}`)).toEqual([
      'HU03 E2',
      'HU10 E1',
      'HU10 E2',
    ]);
    expect(report.unknown.map((t) => t.hu)).toEqual(['HU99']);
  });

  it('dibuja la matriz con el resumen, las filas y las listas de problemas', () => {
    const md = renderMarkdown(report, '2026-10-14');
    expect(md).toContain('1 de 4 escenarios Gherkin tienen prueba (25 %)');
    expect(md).toContain(
      '| HU03 | Recuperar contraseña | E1: Solicitud exitosa | a | api | `a.ts` |',
    );
    expect(md).toContain('b \\| con barra');
    expect(md).toContain(
      '| HU10 | Editar perfil | E1: Edición exitosa | **SIN PRUEBA** | | |',
    );
    expect(md).toContain('## Escenarios sin prueba');
    expect(md).toContain('- HU99 E1: huérfana (`c.ts`)');
  });

  it('un escenario con dos pruebas ocupa dos filas y no se cuenta doble', () => {
    const md = renderMarkdown(report, '2026-10-14');
    expect(md.match(/E1: Solicitud exitosa/g)).toHaveLength(2);
    expect(md).toContain('1 de 4 escenarios');
  });
});
