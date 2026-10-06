import { SendMessageDto } from './send-message.dto.js';

// Mismas reglas que al enviar: de 1 a 2000 caracteres sin los bordes.
export class EditMessageDto extends SendMessageDto {}
