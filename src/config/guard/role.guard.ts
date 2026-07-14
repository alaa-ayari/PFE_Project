import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from 'src/config/decorator/role.decorators';
import { UserRole } from 'src/users/schema/Role_enum';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user || !user.role) {
      this.logger.warn('RolesGuard reached without an authenticated user — is JwtAuthGuard listed first?');
      throw new ForbiddenException('Authentication required');
    }

    if (!requiredRoles.includes(user.role)) {
      this.logger.warn(
        `Access denied for user ${user.userId} with role ${user.role} — required: ${requiredRoles.join(', ')}`,
      );
      throw new ForbiddenException(
        `User role ${user.role} is not authorized to access this resource`,
      );
    }
    return true;
  }
}
