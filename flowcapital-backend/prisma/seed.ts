import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('password123', 10);

  // 1. Create SME User
  const sme = await prisma.user.upsert({
    where: { email: 'sme@example.com' },
    update: {},
    create: {
      email: 'sme@example.com',
      password: hashedPassword,
      role: 'SME',
      kycStatus: true,
      wallet: {
        create: { balance: 5000 }
      }
    }
  });

  // 2. Create Investor User
  const investor = await prisma.user.upsert({
    where: { email: 'investor@example.com' },
    update: {},
    create: {
      email: 'investor@example.com',
      password: hashedPassword,
      role: 'INVESTOR',
      kycStatus: true,
      wallet: {
        create: { balance: 25000 }
      }
    }
  });

  // 3. Create Invoices
  const invoices = [
    {
      amount: 12500,
      buyer: 'GlobalTech Solutions',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
      status: 'TOKENIZED',
      smeId: sme.id
    },
    {
      amount: 8400,
      buyer: 'Horizon Logistics',
      dueDate: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
      status: 'TOKENIZED',
      smeId: sme.id
    },
    {
      amount: 45000,
      buyer: 'Apex Retail',
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      status: 'PENDING',
      smeId: sme.id
    }
  ];

  for (const invData of invoices) {
    const inv = await prisma.invoice.create({
      data: invData
    });

    if (invData.status === 'TOKENIZED') {
      // Create a mock risk score for tokenized invoices
      await prisma.riskScore.create({
        data: {
          score: 85,
          category: 'A',
          invoiceId: inv.id
        }
      });

      // Create a mock blockchain record
      await prisma.blockchainRecord.create({
        data: {
          contractAddress: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
          tokenId: Math.floor(Math.random() * 100000).toString(),
          invoiceId: inv.id
        }
      });
    }
  }

  console.log('Seeding complete! Logged in as:');
  console.log('SME: sme@example.com / password123');
  console.log('Investor: investor@example.com / password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
