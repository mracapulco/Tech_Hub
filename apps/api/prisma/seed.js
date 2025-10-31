const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@techhub.com';
  const username = 'admin';
  const password = 'Tech123!@#';

  const hash = await bcrypt.hash(password, 10);
  let existing = await prisma.user.findUnique({ where: { username } });
  if (!existing) {
    // tenta localizar por email para atualizar usuário já criado anteriormente
    existing = await prisma.user.findUnique({ where: { email } });
  }
  if (!existing) {

    let company = await prisma.company.findFirst({ where: { name: 'Tech Hub' } });
    if (!company) {
      company = await prisma.company.create({ data: { name: 'Tech Hub' } });
    }

    const user = await prisma.user.create({
      data: { email, username, name: 'Administrador', lastName: 'Master', password: hash },
    });

    await prisma.userCompanyMembership.create({
      data: { userId: user.id, companyId: company.id, role: 'ADMIN' },
    });

    console.log('Usuário admin criado:', username);
  } else {
    // Atualiza para garantir username e senha do cenário
    await prisma.user.update({ where: { id: existing.id }, data: { username, email, password: hash, lastName: existing.lastName ?? 'Master' } });
    console.log('Usuário admin já existe, atualizado:', username);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });