// book.service.ts
import { Injectable } from "@nestjs/common";
import { Book } from "src/generated/prisma/client";
import { PrismaService } from "src/prisma/prisma.service";

@Injectable()
export class BookService {
	constructor(private prisma: PrismaService) {}

	async FindAll(): Promise<Book[]> {
		return this.prisma.book.findMany();
	}

	async FindOne(id: string): Promise<Book | null> {
		return this.prisma.book.findUnique({
			where: {
				id: id,
			},
		});
	}
}
