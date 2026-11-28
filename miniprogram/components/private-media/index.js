const links = require('../../utils/media-links');
Component({
  externalClasses: ['media-class'],
  properties: {
    src: { type: String, value: '', observer: 'sourceChanged' },
    mode: { type: String, value: 'scaleToFill' },
    kind: { type: String, value: 'image' },
    controls: { type: Boolean, value: true }
  },
  data: { url: '', error: '', loading: false },
  lifetimes: { attached() { this.detached = false; this.sourceChanged(); }, detached() { this.detached = true; this.sequence = (this.sequence || 0) + 1; } },
  methods: {
    sourceChanged() { this.autoRetried = false; return this.load(false); },
    async load(force) {
      const sequence = this.sequence = (this.sequence || 0) + 1;
      const source = this.properties.src;
      this.setData({ url: '', error: '', loading: Boolean(source) });
      if (!source) return;
      try {
        const url = await links.resolve(source, force);
        if (sequence === this.sequence && !this.detached) this.setData({ url });
      } catch (error) {
        if (sequence === this.sequence && !this.detached) this.setData({ error: error.message || '图片加载失败' });
      } finally { if (sequence === this.sequence && !this.detached) this.setData({ loading: false }); }
    },
    failed() {
      if (!this.autoRetried) { this.autoRetried = true; return this.load(true); }
      this.setData({ url: '', error: '图片加载失败，请重试' });
    },
    retry() { if (!this.data.loading) return this.load(true); },
    loaded(event) { this.triggerEvent('load', event.detail); }
  }
});
