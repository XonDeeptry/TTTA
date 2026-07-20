import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ZaloBinding } from '@prisma/client';
import { InternalTokenGuard } from '../auth/internal-token.guard';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { ActivateBindingDto } from './dto/activate-binding.dto';
import { EnsureBindingDto } from './dto/ensure-binding.dto';
import { OnboardingService } from './onboarding.service';

@Controller()
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  /** Gọi bởi grading-worker (M3) khi thấy một zalo_user_id chưa có binding. */
  @Post('internal/bindings/ensure')
  @UseGuards(InternalTokenGuard)
  ensure(@Body() body: EnsureBindingDto): Promise<ZaloBinding[]> {
    return this.onboarding.ensureBinding(body.zaloUserId, body.displayName);
  }

  @Get('onboarding/pending')
  @UseGuards(SessionAuthGuard)
  pending(): Promise<ZaloBinding[]> {
    return this.onboarding.listPending();
  }

  @Patch('onboarding/:id/activate')
  @UseGuards(SessionAuthGuard)
  activate(@Param('id', ParseIntPipe) id: number, @Body() body: ActivateBindingDto): Promise<ZaloBinding> {
    return this.onboarding.activate(id, body.phone);
  }
}
