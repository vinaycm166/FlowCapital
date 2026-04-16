const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const run = async () => {
    let invs = await prisma.invoice.findMany({ where: { status: 'PENDING_VERIFICATION' } });
    console.log("Invoices count:", invs.length);
    console.log(invs);
}
run();
