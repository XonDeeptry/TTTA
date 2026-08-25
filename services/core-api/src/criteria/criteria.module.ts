import { Module } from '@nestjs/common';
import { BootstrapRubricTemplatesService } from './bootstrap-rubric-templates.service';
import { CriteriaController } from './criteria.controller';
import { CriteriaService } from './criteria.service';
import { RubricTemplateService } from './rubric-template.service';

/**
 * Không cần `imports` và không cần khai báo guard làm provider — cùng lý do đã ghi ở
 * users.module.ts: `PrismaService` đến từ PrismaModule (@Global), `Reflector` do Nest tự cung
 * cấp, nên `PrivilegeGuard` (dùng qua @UseGuards ở CriteriaController) resolve được ngay trong
 * injector của chính module này.
 *
 * `BootstrapRubricTemplatesService` là provider thuần — nó chạy qua hook `OnApplicationBootstrap`
 * và KHÔNG có route nào, không thể gọi từ bên ngoài tiến trình (AC-07.8).
 */
@Module({
  controllers: [CriteriaController],
  providers: [CriteriaService, RubricTemplateService, BootstrapRubricTemplatesService],
  exports: [RubricTemplateService],
})
export class CriteriaModule {}
