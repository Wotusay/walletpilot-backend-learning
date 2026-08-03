import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';
import { join } from 'path';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Serve the static Phantom test page (public/index.html) from the same origin
  // as the API, so the browser flow talks to /auth/* with no CORS setup.
  app.useStaticAssets(join(process.cwd(), 'public'));

  // Every uncaught error leaves as one consistent JSON shape + one structured log line.
  app.useGlobalFilters(new AllExceptionsFilter());

  // Build the OpenAPI spec from the controller decorators and render it with Scalar.
  const config = new DocumentBuilder()
    .setTitle('WalletPilot API')
    .setDescription('Wallet auth, portfolio normalization, and AI analysis')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  app.use('/reference', apiReference({ content: document }));

  await app.listen(3000);
  console.log(`WalletPilot skeleton running on http://localhost:3000`);
  console.log(`API reference available at http://localhost:3000/reference`);
}
bootstrap();
