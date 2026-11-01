import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ChatInfrastructureModule } from '../chat-infrastructure.module';
import { CatalogController } from './catalog.controller';
import { CATALOG_FETCH, CatalogHttpService } from './catalog-http.service';
import { PublicBooksService } from './public-books.service';

@Module({
  imports: [ConfigModule, ChatInfrastructureModule],
  controllers: [CatalogController],
  providers: [
    PublicBooksService,
    CatalogHttpService,
    { provide: CATALOG_FETCH, useValue: fetch },
  ],
  exports: [PublicBooksService, ChatInfrastructureModule],
})
export class PublicBooksModule {}
