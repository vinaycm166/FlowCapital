const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient({
  datasources: { db: { url: 'postgresql://postgres:postgres@localhost:5432/flowcapital?schema=public' } }
});
const run = async () => {
    let invs = await prisma.invoice.findMany({ select: { id: true, status: true, amount: true, buyerName: true } });
    console.log(JSON.stringify(invs, null, 2));
}
run();
