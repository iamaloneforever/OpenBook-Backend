import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class BookService {
  constructor(private prisma: PrismaService) { }
  async FindAll() {
    return this.prisma.book.findMany();
  }
}
