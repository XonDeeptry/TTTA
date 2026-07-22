import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ChangePasswordDto } from './change-password.dto';

/** Chạy đúng luật của ValidationPipe global ({ whitelist: true, transform: true }). */
function failedProps(body: Record<string, unknown>): string[] {
  const dto = plainToInstance(ChangePasswordDto, body);
  return validateSync(dto).map((e) => e.property);
}

describe('ChangePasswordDto', () => {
  it('accepts a valid pair', () => {
    expect(failedProps({ currentPassword: 'old-password-1', newPassword: 'brand-new-password' })).toEqual([]);
  });

  // AC-5: newPassword ngắn hơn 8 ký tự => 400
  it('rejects a new password shorter than 8 characters', () => {
    expect(failedProps({ currentPassword: 'old-password-1', newPassword: 'short' })).toContain('newPassword');
  });

  // AC-5: newPassword === currentPassword => 400
  it('rejects a new password identical to the current one', () => {
    expect(failedProps({ currentPassword: 'same-password-1', newPassword: 'same-password-1' })).toContain(
      'newPassword',
    );
  });

  it('rejects missing or non-string fields', () => {
    expect(failedProps({})).toEqual(expect.arrayContaining(['currentPassword', 'newPassword']));
    expect(failedProps({ currentPassword: 12345678, newPassword: 'brand-new-password' })).toContain(
      'currentPassword',
    );
  });
});
