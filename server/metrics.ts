/*
 * Copyright 2026 Sayak Mukhopadhyay
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';

export async function startMetrics() {
  const port = Number(process.env.AUTODIDACT_METRICS_PORT || 9090);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('AUTODIDACT_METRICS_PORT must be an integer from 1 to 65535.');
  }

  const exporter = new PrometheusExporter({ host: '0.0.0.0', port, endpoint: '/metrics', preventServerStart: true });
  const provider = new MeterProvider({ readers: [exporter] });
  const meter = provider.getMeter('autodidact');

  meter
    .createObservableCounter('process.cpu.time', { unit: 's', description: 'CPU time used by the process.' })
    .addCallback((result) => {
      const { user, system } = process.cpuUsage();
      result.observe(user / 1_000_000, { 'cpu.mode': 'user' });
      result.observe(system / 1_000_000, { 'cpu.mode': 'system' });
    });

  meter
    .createObservableUpDownCounter('process.memory.usage', {
      unit: 'By',
      description: 'Resident memory used by the process.',
    })
    .addCallback((result) => result.observe(process.memoryUsage.rss()));

  meter
    .createObservableGauge('process.uptime', { unit: 's', description: 'Time since the process started.' })
    .addCallback((result) => result.observe(process.uptime()));

  await exporter.startServer();
}
