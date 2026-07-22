import { IsNotEmpty, IsString } from 'class-validator';

export class UpdateGradingDto {
  @IsString()
  @IsNotEmpty()
  reviewedFeedback!: string;
}
