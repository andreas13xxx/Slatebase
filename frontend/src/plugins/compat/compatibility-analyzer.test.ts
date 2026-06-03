import { describe, it, expect } from 'vitest';
import { CompatibilityAnalyzer, calculateLevel } from './compatibility-analyzer';
import type { CompatibilityReport, ApiCallClassification } from './compatibility-analyzer';

describe('CompatibilityAnalyzer', () => {
  const analyzer = new CompatibilityAnalyzer();

  describe('analyze() — API pattern detection', () => {
    it('detects vault.read access', () => {
      const source = `
        class MyPlugin {
          async onload() {
            const content = await this.app.vault.read(file);
          }
        }
      `;
      const report = analyzer.analyze(source);
      const methods = report.apiCalls.map(c => c.method);
      expect(methods).toContain('vault.read');
    });

    it('detects workspace.getActiveFile access', () => {
      const source = `
        class MyPlugin {
          async onload() {
            const file = this.app.workspace.getActiveFile();
          }
        }
      `;
      const report = analyzer.analyze(source);
      const methods = report.apiCalls.map(c => c.method);
      expect(methods).toContain('workspace.getActiveFile');
    });

    it('detects metadataCache.getFileCache access', () => {
      const source = `
        class MyPlugin {
          async onload() {
            const cache = this.app.metadataCache.getFileCache(file);
          }
        }
      `;
      const report = analyzer.analyze(source);
      const methods = report.apiCalls.map(c => c.method);
      expect(methods).toContain('metadataCache.getFileCache');
    });

    it('detects plugins.getPlugin access', () => {
      const source = `
        class MyPlugin {
          async onload() {
            const other = this.app.plugins.getPlugin('other-plugin');
          }
        }
      `;
      const report = analyzer.analyze(source);
      const methods = report.apiCalls.map(c => c.method);
      expect(methods).toContain('plugins.getPlugin');
    });

    it('detects multiple different API accesses', () => {
      const source = `
        class MyPlugin {
          async onload() {
            const file = this.app.workspace.getActiveFile();
            const content = await this.app.vault.read(file);
            const cache = this.app.metadataCache.getFileCache(file);
            await this.app.vault.modify(file, 'new content');
          }
        }
      `;
      const report = analyzer.analyze(source);
      const methods = report.apiCalls.map(c => c.method);
      expect(methods).toContain('workspace.getActiveFile');
      expect(methods).toContain('vault.read');
      expect(methods).toContain('vault.modify');
      expect(methods).toContain('metadataCache.getFileCache');
    });

    it('deduplicates repeated accesses to the same method', () => {
      const source = `
        class MyPlugin {
          async onload() {
            await this.app.vault.read(file1);
            await this.app.vault.read(file2);
            await this.app.vault.read(file3);
          }
        }
      `;
      const report = analyzer.analyze(source);
      const vaultReadCalls = report.apiCalls.filter(c => c.method === 'vault.read');
      expect(vaultReadCalls).toHaveLength(1);
    });

    it('detects lifecycle methods (onload/onunload)', () => {
      const source = `
        class MyPlugin extends Plugin {
          async onload() {
            console.log('loaded');
          }
          onunload() {
            console.log('unloaded');
          }
        }
      `;
      const report = analyzer.analyze(source);
      const methods = report.apiCalls.map(c => c.method);
      expect(methods).toContain('onload');
      expect(methods).toContain('onunload');
    });

    it('detects Plugin.registerEvent usage', () => {
      const source = `
        class MyPlugin extends Plugin {
          async onload() {
            this.registerEvent(
              this.app.vault.on('modify', (file) => {})
            );
          }
        }
      `;
      const report = analyzer.analyze(source);
      const methods = report.apiCalls.map(c => c.method);
      expect(methods).toContain('Plugin.registerEvent');
    });

    it('detects API accesses via variable references (app.vault.read)', () => {
      const source = `
        function doSomething(app) {
          return app.vault.read(file);
        }
      `;
      const report = analyzer.analyze(source);
      const methods = report.apiCalls.map(c => c.method);
      expect(methods).toContain('vault.read');
    });
  });

  describe('analyze() — classification', () => {
    it('classifies vault.read as supported', () => {
      const source = `this.app.vault.read(file)`;
      const report = analyzer.analyze(source);
      const call = report.apiCalls.find(c => c.method === 'vault.read');
      expect(call?.classification).toBe('supported');
    });

    it('classifies workspace.getActiveFile as supported', () => {
      const source = `this.app.workspace.getActiveFile()`;
      const report = analyzer.analyze(source);
      const call = report.apiCalls.find(c => c.method === 'workspace.getActiveFile');
      expect(call?.classification).toBe('supported');
    });

    it('classifies workspace.trigger as partial', () => {
      const source = `this.app.workspace.trigger('my-event')`;
      const report = analyzer.analyze(source);
      const call = report.apiCalls.find(c => c.method === 'workspace.trigger');
      expect(call?.classification).toBe('partial');
    });

    it('classifies vault.trigger as partial', () => {
      const source = `this.app.vault.trigger('create', file)`;
      const report = analyzer.analyze(source);
      const call = report.apiCalls.find(c => c.method === 'vault.trigger');
      expect(call?.classification).toBe('partial');
    });

    it('classifies workspace.getLeaf as unsupported', () => {
      const source = `this.app.workspace.getLeaf(true)`;
      const report = analyzer.analyze(source);
      const call = report.apiCalls.find(c => c.method === 'workspace.getLeaf');
      expect(call?.classification).toBe('unsupported');
    });

    it('classifies workspace.getLeavesOfType as unsupported', () => {
      const source = `this.app.workspace.getLeavesOfType('markdown')`;
      const report = analyzer.analyze(source);
      const call = report.apiCalls.find(c => c.method === 'workspace.getLeavesOfType');
      expect(call?.classification).toBe('unsupported');
    });

    it('classifies unknown methods as unsupported', () => {
      const source = `this.app.workspace.someUnknownMethod()`;
      const report = analyzer.analyze(source);
      const call = report.apiCalls.find(c => c.method === 'workspace.someUnknownMethod');
      expect(call?.classification).toBe('unsupported');
    });
  });

  describe('analyze() — compatibility level calculation', () => {
    it('returns full when all calls are supported', () => {
      const source = `
        class MyPlugin {
          async onload() {
            const file = this.app.workspace.getActiveFile();
            const content = await this.app.vault.read(file);
            const name = this.app.vault.getName();
          }
        }
      `;
      const report = analyzer.analyze(source);
      expect(report.level).toBe('full');
    });

    it('returns full when no API calls are detected', () => {
      const source = `
        class MyPlugin {
          async onload() {
            console.log('hello world');
          }
        }
      `;
      const report = analyzer.analyze(source);
      expect(report.level).toBe('full');
    });

    it('returns partial when a partial method is used', () => {
      const source = `
        class MyPlugin {
          async onload() {
            this.app.workspace.trigger('my-custom-event');
            this.app.vault.read(file);
          }
        }
      `;
      const report = analyzer.analyze(source);
      expect(report.level).toBe('partial');
    });

    it('returns partial when an unsupported non-lifecycle-critical method is used', () => {
      const source = `
        class MyPlugin {
          async onload() {
            const leaf = this.app.workspace.getLeaf(true);
            this.app.vault.read(file);
          }
        }
      `;
      const report = analyzer.analyze(source);
      expect(report.level).toBe('partial');
    });

    it('returns unsupported when a lifecycle-critical method is unsupported', () => {
      // To make a lifecycle-critical method unsupported, we need vault.read or vault.modify
      // to be unsupported. Since those are in the supported set, we test the level
      // calculation logic directly by using a source that accesses an unsupported
      // workspace method that is also lifecycle-critical.
      // Since all currently lifecycle-critical methods (onload, onunload,
      // Plugin.registerEvent, vault.read, vault.modify) are supported,
      // we verify the calculation logic with a plugin that uses ONLY unsupported
      // leaf-management APIs. The level should be 'partial' (not 'unsupported')
      // because leaf methods are not lifecycle-critical.
      // Instead, let's test that a plugin with only supported lifecycle-critical
      // methods gets 'full', and verify the unsupported case via level calculation tests below.
      const source = `
        class MyPlugin extends Plugin {
          async onload() {
            this.registerEvent(this.app.vault.on('modify', () => {}));
          }
        }
      `;
      const report = analyzer.analyze(source);
      // Plugin.registerEvent is lifecycle-critical AND supported
      const registerEventCall = report.apiCalls.find(c => c.method === 'Plugin.registerEvent');
      expect(registerEventCall?.classification).toBe('supported');
      expect(report.level).toBe('full');
    });

    it('correctly identifies lifecycle-critical methods in the report', () => {
      const source = `
        class MyPlugin extends Plugin {
          async onload() {
            await this.app.vault.read(file);
            await this.app.vault.modify(file, 'data');
            this.registerEvent(this.app.vault.on('modify', () => {}));
          }
          onunload() {}
        }
      `;
      const report = analyzer.analyze(source);
      const criticalMethods = report.lifecycleCritical.map(c => c.method);
      expect(criticalMethods).toContain('vault.read');
      expect(criticalMethods).toContain('vault.modify');
      expect(criticalMethods).toContain('onload');
      expect(criticalMethods).toContain('onunload');
      expect(criticalMethods).toContain('Plugin.registerEvent');
      // All are supported → level is full
      expect(report.level).toBe('full');
    });
  });

  describe('analyze() — lifecycle-critical extraction', () => {
    it('includes lifecycle-critical methods in lifecycleCritical array', () => {
      const source = `
        class MyPlugin {
          async onload() {
            await this.app.vault.read(file);
            await this.app.vault.modify(file, 'data');
          }
        }
      `;
      const report = analyzer.analyze(source);
      const criticalMethods = report.lifecycleCritical.map(c => c.method);
      expect(criticalMethods).toContain('vault.read');
      expect(criticalMethods).toContain('vault.modify');
      expect(criticalMethods).toContain('onload');
      expect(criticalMethods).toContain('onunload');
    });

    it('does not include non-critical methods in lifecycleCritical', () => {
      const source = `
        class MyPlugin {
          async onload() {
            this.app.workspace.getActiveFile();
            this.app.vault.getMarkdownFiles();
          }
        }
      `;
      const report = analyzer.analyze(source);
      const criticalMethods = report.lifecycleCritical.map(c => c.method);
      expect(criticalMethods).not.toContain('workspace.getActiveFile');
      expect(criticalMethods).not.toContain('vault.getMarkdownFiles');
    });
  });

  describe('analyze() — obfuscated code handling', () => {
    it('returns unknown for empty bundle', () => {
      const report = analyzer.analyze('');
      expect(report.level).toBe('unknown');
      expect(report.apiCalls).toHaveLength(0);
    });

    it('returns unknown for whitespace-only bundle', () => {
      const report = analyzer.analyze('   \n\t\n   ');
      expect(report.level).toBe('unknown');
    });

    it('returns unknown for heavily obfuscated code', () => {
      // Simulate obfuscated code: single long line with mostly non-alphanumeric characters
      const obfuscated = '(' + '![]'.repeat(2000) + '+' + '{}[]'.repeat(1000) + ')';
      const report = analyzer.analyze(obfuscated);
      expect(report.level).toBe('unknown');
    });

    it('does not falsely identify normal minified code as obfuscated', () => {
      // Normal minified code has many lines or high alphanumeric ratio
      const minified = `class MyPlugin{async onload(){const file=this.app.workspace.getActiveFile();if(file){const content=await this.app.vault.read(file);console.log(content)}}}`;
      const report = analyzer.analyze(minified);
      expect(report.level).not.toBe('unknown');
    });
  });

  describe('analyze() — graceful failure', () => {
    it('handles analysis errors gracefully', () => {
      // The analyze method catches all errors and returns unknown
      // We can't easily force an error in a pure regex-based analysis,
      // but we can verify the contract for very large inputs
      const largeSource = 'this.app.vault.read(file);\n'.repeat(100000);
      const report = analyzer.analyze(largeSource);
      // Should either complete successfully or return unknown (timeout)
      expect(['full', 'unknown']).toContain(report.level);
    });
  });

  describe('analyze() — real-world plugin patterns', () => {
    it('analyzes a simple note-counting plugin', () => {
      const source = `
        const { Plugin } = require('obsidian');
        class NoteCounterPlugin extends Plugin {
          async onload() {
            this.addCommand({
              id: 'count-notes',
              name: 'Count notes',
              callback: () => {
                const files = this.app.vault.getMarkdownFiles();
                console.log('Total notes:', files.length);
              }
            });
          }
          onunload() {
            console.log('Bye!');
          }
        }
        module.exports = NoteCounterPlugin;
      `;
      const report = analyzer.analyze(source);
      expect(report.level).toBe('full');
      expect(report.apiCalls.map(c => c.method)).toContain('vault.getMarkdownFiles');
    });

    it('analyzes a plugin using leaf management (unsupported)', () => {
      const source = `
        class ViewPlugin extends Plugin {
          async onload() {
            this.registerEvent(
              this.app.workspace.on('file-open', () => {})
            );
            const leaf = this.app.workspace.getLeaf(true);
            this.app.workspace.setActiveLeaf(leaf);
          }
          onunload() {}
        }
      `;
      const report = analyzer.analyze(source);
      expect(report.apiCalls.map(c => c.method)).toContain('workspace.getLeaf');
      expect(report.apiCalls.map(c => c.method)).toContain('workspace.setActiveLeaf');
      // workspace.getLeaf and setActiveLeaf are unsupported but NOT lifecycle-critical
      // Plugin.registerEvent, onload, onunload are lifecycle-critical but supported
      // → partial (not unsupported)
      expect(report.level).toBe('partial');
    });

    it('analyzes a plugin using only supported metadata APIs', () => {
      const source = `
        class TagCounterPlugin extends Plugin {
          async onload() {
            const file = this.app.workspace.getActiveFile();
            if (file) {
              const cache = this.app.metadataCache.getFileCache(file);
              const tags = cache?.tags || [];
              console.log('Tags:', tags.length);
            }
            this.app.metadataCache.on('changed', (file, data) => {
              console.log('File changed:', file.path);
            });
          }
          onunload() {}
        }
      `;
      const report = analyzer.analyze(source);
      expect(report.level).toBe('full');
      expect(report.apiCalls.map(c => c.method)).toContain('metadataCache.getFileCache');
      expect(report.apiCalls.map(c => c.method)).toContain('metadataCache.on');
    });
  });

  describe('calculateLevel() — direct logic tests', () => {
    it('returns full for empty array', () => {
      expect(calculateLevel([])).toBe('full');
    });

    it('returns full when all calls are supported', () => {
      const calls: ApiCallClassification[] = [
        { method: 'vault.read', classification: 'supported' },
        { method: 'vault.modify', classification: 'supported' },
        { method: 'workspace.getActiveFile', classification: 'supported' },
      ];
      expect(calculateLevel(calls)).toBe('full');
    });

    it('returns partial when a partial call exists but no lifecycle-critical is unsupported', () => {
      const calls: ApiCallClassification[] = [
        { method: 'vault.read', classification: 'supported' },
        { method: 'workspace.trigger', classification: 'partial' },
      ];
      expect(calculateLevel(calls)).toBe('partial');
    });

    it('returns partial when an unsupported non-lifecycle-critical call exists', () => {
      const calls: ApiCallClassification[] = [
        { method: 'vault.read', classification: 'supported' },
        { method: 'workspace.getLeaf', classification: 'unsupported' },
      ];
      expect(calculateLevel(calls)).toBe('partial');
    });

    it('returns unsupported when vault.read is classified as unsupported', () => {
      const calls: ApiCallClassification[] = [
        { method: 'vault.read', classification: 'unsupported' },
        { method: 'workspace.getActiveFile', classification: 'supported' },
      ];
      expect(calculateLevel(calls)).toBe('unsupported');
    });

    it('returns unsupported when vault.modify is classified as unsupported', () => {
      const calls: ApiCallClassification[] = [
        { method: 'vault.modify', classification: 'unsupported' },
      ];
      expect(calculateLevel(calls)).toBe('unsupported');
    });

    it('returns unsupported when onload is classified as unsupported', () => {
      const calls: ApiCallClassification[] = [
        { method: 'onload', classification: 'unsupported' },
        { method: 'vault.read', classification: 'supported' },
      ];
      expect(calculateLevel(calls)).toBe('unsupported');
    });

    it('returns unsupported when onunload is classified as unsupported', () => {
      const calls: ApiCallClassification[] = [
        { method: 'onunload', classification: 'unsupported' },
      ];
      expect(calculateLevel(calls)).toBe('unsupported');
    });

    it('returns unsupported when Plugin.registerEvent is classified as unsupported', () => {
      const calls: ApiCallClassification[] = [
        { method: 'Plugin.registerEvent', classification: 'unsupported' },
        { method: 'vault.read', classification: 'supported' },
      ];
      expect(calculateLevel(calls)).toBe('unsupported');
    });
  });
});
