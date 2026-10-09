import { buildResetEmail, resetLink } from './reset-email.js';

describe('resetLink', () => {
  it('arma la dirección de la pantalla de nueva contraseña', () => {
    expect(resetLink('https://cafeta.example', 'tok_en-1')).toBe(
      'https://cafeta.example/reset-password?token=tok_en-1',
    );
  });

  it('quita las barras finales de la base y codifica el token', () => {
    expect(resetLink('http://localhost:5173//', 'a b/c')).toBe(
      'http://localhost:5173/reset-password?token=a%20b%2Fc',
    );
  });
});

describe('buildResetEmail', () => {
  const message = buildResetEmail(
    'cgomez@est.intec.edu.do',
    'https://cafeta.example/reset-password?token=abc',
    30,
  );

  it('va al destinatario, en español, con el enlace y la vigencia', () => {
    expect(message.to).toBe('cgomez@est.intec.edu.do');
    expect(message.subject).toBe('Restablece tu contraseña de Cafeta');
    expect(message.text).toContain(
      'https://cafeta.example/reset-password?token=abc',
    );
    expect(message.text).toContain('30 minutos');
  });

  it('avisa que sirve una sola vez y qué hacer si no fue la persona', () => {
    expect(message.text).toContain('una sola vez');
    expect(message.text).toContain('ignora este correo');
  });
});
