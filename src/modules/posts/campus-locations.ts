// Ubicaciones fijas del campus que se pueden elegir al publicar (spec 0005).
// La web las recibe por el OpenAPI; si cambia esta lista, se regenera api-types.ts.
export const CAMPUS_LOCATIONS = [
  'Campus Principal',
  'Biblioteca',
  'Cafetería INTEC',
  'Laboratorio de Computación',
  'Auditorio',
  'Cancha Deportiva',
  'Área de Parqueo',
  'Centro de Estudiantes',
] as const;

export type CampusLocation = (typeof CAMPUS_LOCATIONS)[number];
