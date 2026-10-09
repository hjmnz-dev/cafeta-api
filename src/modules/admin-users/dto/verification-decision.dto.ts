import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const VERIFICATION_DECISIONS = ['VERIFIED', 'REJECTED'] as const;
export type VerificationDecision = (typeof VERIFICATION_DECISIONS)[number];

export class VerificationDecisionDto {
  /** VERIFIED aprueba la cuenta institucional; REJECTED la rechaza. */
  @ApiProperty({ enum: VERIFICATION_DECISIONS })
  @IsIn(VERIFICATION_DECISIONS)
  decision: VerificationDecision;
}
