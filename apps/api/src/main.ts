import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { buildOpenApi, configureApp } from './bootstrap.js';
import { loadConfig } from './config/env.js';

async function bootstrap() {
  const config = loadConfig(process.env);
  const app = await NestFactory.create(AppModule);
  configureApp(app, config.corsOrigins);
  if (config.env !== 'production') {
    SwaggerModule.setup('api/docs', app, buildOpenApi(app), {
      jsonDocumentUrl: 'api/v1/openapi.json',
    });
  }
  await app.listen(config.port, '0.0.0.0');
}

void bootstrap();
