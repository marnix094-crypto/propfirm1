import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module.js';
import { buildOpenApi } from '../bootstrap.js';

/**
 * Writes the OpenAPI spec to packages/shared/openapi.json without connecting to any
 * database or feed (`preview` mode builds the module graph only).
 */
const out =
  process.argv[2] ?? new URL('../../../../packages/shared/openapi.json', import.meta.url).pathname;
const app = await NestFactory.create(AppModule, { preview: true, logger: false });
app.setGlobalPrefix('api/v1');
const doc = buildOpenApi(app);
writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
console.log(`OpenAPI written to ${out} (${Object.keys(doc.paths).length} paths)`);
await app.close();
