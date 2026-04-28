import * as analytics from '../storage/analytics';
import { make } from '../utils/logger';

const log = make('report');

function pad(str: string, len: number): string {
  return str.padEnd(len, ' ');
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function generateReport(days: number): string {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - days);

  const stats = analytics.getWeeklyStats(start);
  const lines: string[] = [];

  lines.push('=== Tweetly Haftalik Raporu ===');
  lines.push(`Donem: ${stats.startDate} - ${stats.endDate}`);
  lines.push('');

  lines.push('Genel:');
  lines.push(`  Toplam post: ${stats.totalPosts}`);
  lines.push(`  Basarili:    ${stats.totalSuccess} (${formatPercent(stats.successRate)})`);
  lines.push(`  Basarisiz:   ${stats.totalFailure}`);
  lines.push(`  Ort. sure:   ${Math.round(stats.avgDurationMs)}ms`);
  lines.push('');

  if (stats.formatStats.length > 0) {
    lines.push('Format Bazli:');
    lines.push(`  ${pad('Format', 16)} ${pad('Post', 6)} ${pad('Basarili', 10)} ${pad('Oran', 8)} Ort.Sure`);
    lines.push(`  ${'-'.repeat(60)}`);
    for (const fs of stats.formatStats) {
      lines.push(
        `  ${pad(fs.format, 16)} ${pad(String(fs.total), 6)} ${pad(String(fs.success), 10)} ${pad(formatPercent(fs.successRate), 8)} ${Math.round(fs.avgDurationMs)}ms`
      );
    }
    lines.push('');
  }

  const topicEntries = Object.entries(stats.topicDistribution).sort((a, b) => b[1] - a[1]);
  if (topicEntries.length > 0) {
    lines.push('Topic Bazli:');
    lines.push(`  ${pad('Topic', 16)} Post`);
    lines.push(`  ${'-'.repeat(30)}`);
    for (const [topic, count] of topicEntries) {
      lines.push(`  ${pad(topic, 16)} ${count}`);
    }
    lines.push('');
  }

  if (stats.topRepos.length > 0) {
    lines.push('En Cok Paylasilan Repolar:');
    for (let i = 0; i < stats.topRepos.length; i++) {
      const r = stats.topRepos[i];
      lines.push(`  ${i + 1}. ${r.repo} (${r.count} tweet)`);
    }
    lines.push('');
  }

  if (stats.dailyBreakdown.length > 0) {
    lines.push('Gunluk Dagilim:');
    lines.push(`  ${pad('Tarih', 12)} ${pad('Toplam', 8)} ${pad('Basarili', 10)} ${pad('Basarisiz', 10)}`);
    lines.push(`  ${'-'.repeat(45)}`);
    for (const d of stats.dailyBreakdown) {
      if (d.total > 0) {
        lines.push(`  ${pad(d.date, 12)} ${pad(String(d.total), 8)} ${pad(String(d.success), 10)} ${pad(String(d.failure), 10)}`);
      }
    }
    lines.push('');
  }

  lines.push('Notlar:');
  lines.push('  - Gercek etkilesim metrikleri (impression, like, reply sayisi) X API gerekir');
  lines.push('  - Question format reply orani yuksek mi? (manuel kontrol gerekli)');
  lines.push('  - Mini thread\'ler bookmark aldi mi? (manuel kontrol gerekli)');

  return lines.join('\n');
}

function main(): void {
  const daysArg = process.argv.find((a) => /^\d+$/.test(a));
  const days = daysArg ? parseInt(daysArg, 10) : 7;

  const report = generateReport(days);
  console.log(report);
  console.log('');
  log.ok(`Son ${days} gun raporu olusturuldu.`);
}

main();
