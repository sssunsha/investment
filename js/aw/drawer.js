// js/aw/drawer.js
import { renderMarkdown } from '../markdown.js';
import { GUIDE_MD, MDTFR_GUIDE_MD } from './config.js';

function openDrawer() {
  const activeTab = document.querySelector('.tab-btn.active')?.id || '';
  const isMdtfr = activeTab === 'tab-mdtfr';
  const md = isMdtfr ? MDTFR_GUIDE_MD : GUIDE_MD;
  const title = isMdtfr ? '📖 动量趋势双重过滤轮动策略操作指南' : '📖 全天候配置动态平衡策略操作指南';
  document.querySelector('#guide-drawer .drawer-title').textContent = title;
  document.getElementById('drawer-content').innerHTML = renderMarkdown(md);
  document.getElementById('guide-drawer').classList.add('open');
  document.getElementById('drawer-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  document.getElementById('guide-drawer').classList.remove('open');
  document.getElementById('drawer-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

export { openDrawer, closeDrawer };
