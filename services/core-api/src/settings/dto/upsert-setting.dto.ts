import { IsDefined } from 'class-validator';

export class UpsertSettingDto {
  @IsDefined()
  value!: string | number | boolean;
}
