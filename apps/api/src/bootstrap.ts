import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { ProblemDetailsFilter } from './common/problem-details.filter.js';
import { installBigIntJson } from './common/json.js';
import { BRAND_NAME } from './config/brand.js';

/** Shared app setup for main.ts, tests and the OpenAPI export. */
export function configureApp(app: INestApplication, corsOrigins: string[]): void {
  installBigIntJson();
  app.setGlobalPrefix('api/v1');
  app.enableCors({ origin: corsOrigins, credentials: true });
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();
}

export function buildOpenApi(app: INestApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle(`${BRAND_NAME} API`)
    .setDescription(
      'Simulated trading platform API. Money: integer strings in minor units (…Minor). Prices/quantities: decimal strings.',
    )
    .setVersion('0.3.0')
    .addBearerAuth()
    .addSecurityRequirements('bearer')
    .build();
  return SwaggerModule.createDocument(app, config);
}
