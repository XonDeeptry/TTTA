import { SetMetadata } from '@nestjs/common';
import { DashboardRole } from './session.types';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: DashboardRole[]): MethodDecorator & ClassDecorator => SetMetadata(ROLES_KEY, roles);
