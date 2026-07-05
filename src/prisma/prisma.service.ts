import { Injectable } from "@nestjs/common";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

@Injectable()
export class PrismaService extends PrismaClient {
	constructor() {
		const adapter = new PrismaPg({
			connectionString: "postgresql://alone:norozi58@localhost:5432/mybook",
		});
		super({ adapter });
	}
}
