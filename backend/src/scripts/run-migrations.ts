import { AppDataSource } from '@persistence/data-source';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  const applied = await AppDataSource.runMigrations({ transaction: 'all' });
  if (applied.length === 0) {
    console.log('Bekleyen migration yok.');
  } else {
    for (const m of applied) {
      console.log(`Uygulandı: ${m.name}`);
    }
  }
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
