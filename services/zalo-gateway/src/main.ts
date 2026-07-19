import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { existsSync } from 'fs';
import { resolve } from 'path';

// Dev local: nạp infra/.env nếu có (Docker inject env trực tiếp nên bỏ qua)
const envPath = resolve(__dirname, '../../../infra/.env');
if (existsSync(envPath)) loadEnv({ path: envPath });

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody cần cho verify chữ ký webhook (sha256 trên body gốc)
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  const port = Number(process.env.GATEWAY_PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`zalo-gateway listening on :${port}`);
}

void bootstrap();
