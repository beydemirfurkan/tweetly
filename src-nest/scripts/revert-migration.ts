import { AppDataSource } from '../persistence/data-source';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  await AppDataSource.undoLastMigration({ transaction: 'all' });
  await AppDataSource.destroy();
  console.log('Son migration geri alındı.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
