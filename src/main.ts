import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
async function bootstrap() {
  
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  
  // Enable CORS FIRST - before any middleware
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Enable global validation
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }));

  // Log all requests to uploads directory
  app.use('/uploads', (req, res, next) => {
    console.log(`[STATIC FILE REQUEST] ${req.method} ${req.originalUrl}`);
    console.log(`[STATIC FILE] Full path: ${join(__dirname, '..', 'uploads', req.path)}`);
    next();
  });

  // Serve static files from uploads directory
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
