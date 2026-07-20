import { IsNotEmpty, IsString } from 'class-validator';

export class ActivateBindingDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
