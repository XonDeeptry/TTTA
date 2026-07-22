import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { CreateUserDto } from './create-user.dto';
import { ResetPasswordDto } from './reset-password.dto';

/** Đúng cấu hình ValidationPipe global ở main.ts:22. */
const pipe = new ValidationPipe({ whitelist: true, transform: true });

function runCreate(body: unknown): Promise<CreateUserDto> {
  return pipe.transform(body, { type: 'body', metatype: CreateUserDto }) as Promise<CreateUserDto>;
}

function runReset(body: unknown): Promise<ResetPasswordDto> {
  return pipe.transform(body, { type: 'body', metatype: ResetPasswordDto }) as Promise<ResetPasswordDto>;
}

const VALID = { email: 'teacher@ilm.local', role: 'staff', password: 'initial1' };

describe('CreateUserDto', () => {
  it('accepts a valid body', async () => {
    await expect(runCreate(VALID)).resolves.toEqual(VALID);
  });

  // AC-08 / NFR-S6: whitelist cắt sạch thuộc tính lạ trước khi tới service
  it('strips id / passwordHash / mustChangePassword smuggled into the body', async () => {
    const cleaned = await runCreate({
      ...VALID,
      id: 99,
      passwordHash: 'pre-computed-hash',
      mustChangePassword: false,
      role_: 'admin',
    });

    expect(Object.keys(cleaned).sort()).toEqual(['email', 'password', 'role']);
    expect(cleaned).not.toHaveProperty('passwordHash');
    expect(cleaned).not.toHaveProperty('mustChangePassword');
    expect(cleaned).not.toHaveProperty('id');
  });

  // AC-09 (BVA) — cùng luật MinLength(8) như F4, không có chính sách mới
  it('accepts a password of exactly 8 characters', async () => {
    await expect(runCreate({ ...VALID, password: '12345678' })).resolves.toMatchObject({
      password: '12345678',
    });
  });

  it('accepts a very long password (no maximum, no complexity rule)', async () => {
    const long = 'a'.repeat(200);
    await expect(runCreate({ ...VALID, password: long })).resolves.toMatchObject({ password: long });
    await expect(runCreate({ ...VALID, password: 'nocomplexityrequired' })).resolves.toBeDefined();
  });

  it('rejects a password of 7 characters, empty, null or non-string', async () => {
    await expect(runCreate({ ...VALID, password: '1234567' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(runCreate({ ...VALID, password: '' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(runCreate({ ...VALID, password: null })).rejects.toBeInstanceOf(BadRequestException);
    await expect(runCreate({ ...VALID, password: 12345678 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(runCreate({ email: VALID.email, role: 'staff' })).rejects.toBeInstanceOf(BadRequestException);
  });

  // AC-10
  it('rejects a malformed email', async () => {
    await expect(runCreate({ ...VALID, email: 'not-an-email' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(runCreate({ ...VALID, email: '  teacher@ilm.local  ' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(runCreate({ role: 'staff', password: 'initial1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // AC-11 / §0: chỉ đúng hai vai trò admin | staff
  it('rejects any role other than admin or staff', async () => {
    for (const role of ['teacher', 'Admin', 'STAFF', 'superadmin', '', null, 1]) {
      await expect(runCreate({ ...VALID, role })).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(runCreate({ email: VALID.email, password: 'initial1' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(runCreate({ ...VALID, role: 'admin' })).resolves.toMatchObject({ role: 'admin' });
  });

  // Sai lệch có chủ ý: email KHÔNG bị normalize ở tầng DTO (giữ nguyên hoa/thường)
  it('leaves the email case untouched', async () => {
    await expect(runCreate({ ...VALID, email: 'GiaoVien@ILM.Local' })).resolves.toMatchObject({
      email: 'GiaoVien@ILM.Local',
    });
  });
});

describe('ResetPasswordDto', () => {
  // AC-13 (BVA)
  it('accepts a new password of exactly 8 characters', async () => {
    await expect(runReset({ newPassword: '12345678' })).resolves.toEqual({ newPassword: '12345678' });
  });

  it('rejects a short, empty, missing or non-string new password', async () => {
    await expect(runReset({ newPassword: '1234567' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(runReset({ newPassword: '' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(runReset({})).rejects.toBeInstanceOf(BadRequestException);
    await expect(runReset({ newPassword: 12345678 })).rejects.toBeInstanceOf(BadRequestException);
  });

  // BR-4: cố ý KHÔNG có currentPassword — và nếu client gửi kèm thì bị whitelist cắt
  it('has no currentPassword field and strips one if sent', async () => {
    const cleaned = await runReset({ newPassword: 'brand-new-pass-9', currentPassword: 'whatever1' });
    expect(Object.keys(cleaned)).toEqual(['newPassword']);
  });
});
