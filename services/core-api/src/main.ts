import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Dev local: nạp infra/.env nếu có (Docker inject env trực tiếp nên bỏ qua)
const envPath = resolve(__dirname, '../../../infra/.env');
if (existsSync(envPath)) loadEnv({ path: envPath });

import connectRedis from 'connect-redis';
import session from 'express-session';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { RedisService } from './redis.service';
import './auth/session.types';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableShutdownHooks();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const redis = app.get(RedisService);
  const RedisStore = connectRedis(session);
  app.use(
    session({
      store: new RedisStore({ client: redis.client }),
      secret: process.env.SESSION_SECRET ?? 'dev-only-insecure-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },
    }),
  );

  const port = Number(process.env.CORE_API_PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`core-api listening on :${port}`);
}

void bootstrap();
