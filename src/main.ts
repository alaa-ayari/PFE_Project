// NestJS bootstrap: CORS, raw body for Stripe webhook, global validation pipe.

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { JwtService } from '@nestjs/jwt';
import { join } from 'path';
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {

    rawBody: true,
  });

  (app as any).disable?.('x-powered-by');

  const allowed = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: allowed.length > 0 ? allowed : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });
  if (allowed.length > 0) {
    console.log(`[CORS] restricted to: ${allowed.join(', ')}`);
  } else {
    console.warn(
      '[CORS] CORS_ALLOWED_ORIGINS empty — reflecting all origins (dev only). ' +
        'Set it before production.',
    );
  }

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  const jwtService = app.get(JwtService);
  const SENSITIVE_PREFIXES = [
    '/uploads/users/verifications/',
    '/uploads/users/signatures/',
  ];
  app.use((req: any, res: any, next: any) => {
    const isSensitive = SENSITIVE_PREFIXES.some((p) =>
      req.originalUrl.startsWith(p),
    );
    if (!isSensitive) return next();

    const headerToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const queryToken = typeof req.query?.token === 'string' ? req.query.token : '';
    const token = headerToken || queryToken;
    if (!token) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    try {
      jwtService.verify(token);
      return next();
    } catch {
      return res.status(401).json({ message: 'Invalid or expired token' });
    }
  });

  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
