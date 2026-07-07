import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Serve the static Phantom test page (public/index.html) from the same origin
  // as the API, so the browser flow talks to /auth/* with no CORS setup.
  app.useStaticAssets(join(__dirname, '..', 'public'));
  await app.listen(3000);
  console.log(`WalletPilot skeleton running on http://localhost:3000`);
}
bootstrap();
