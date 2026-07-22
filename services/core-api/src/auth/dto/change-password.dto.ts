import {
  IsString,
  MinLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Cross-field constraint: giá trị của thuộc tính này phải KHÁC với thuộc tính
 * `property` được truyền vào. class-validator không có decorator sẵn cho việc so
 * sánh chéo hai trường nên tự đăng ký ở đây (chỉ dùng nội bộ cho ChangePasswordDto).
 */
function IsDifferentFrom(property: string, validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isDifferentFrom',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [relatedPropertyName] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[relatedPropertyName];
          return value !== relatedValue;
        },
        defaultMessage(args: ValidationArguments): string {
          const [relatedPropertyName] = args.constraints as [string];
          return `${args.property} must differ from ${relatedPropertyName}`;
        },
      },
    });
  };
}

/**
 * Body cho POST /auth/change-password. Mirror phong cách class-validator của LoginDto:
 * cùng quy tắc MinLength(8) cho mật khẩu mới; ràng buộc chéo newPassword !== currentPassword
 * được kiểm ở tầng validation (=> 400) — đúng như F4-ba.md §1.4.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(8)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @IsDifferentFrom('currentPassword', { message: 'new password must differ from current' })
  newPassword!: string;
}
