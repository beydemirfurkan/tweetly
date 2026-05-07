import { AppDataSource } from '@persistence/data-source';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  await AppDataSource.undoLastMigration({ transaction: 'all' });
  await AppDataSource.destroy();
  console.log('Reverted last migration.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
