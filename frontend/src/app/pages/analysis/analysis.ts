import { Component } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';

interface AnalysisItem {
  title: string;
  summary: string;
  sentiment: 'positive' | 'negative' | 'neutral';
  time: string;
}

@Component({
  selector: 'app-analysis',
  standalone: true,
  imports: [MatIconModule, MatChipsModule, MatButtonModule],
  templateUrl: './analysis.html',
  styleUrl: './analysis.scss',
})
export class AnalysisComponent {
  tabs = ['全部', '个股', '行业', '宏观'];
  activeTab = '全部';

  analysisItems: AnalysisItem[] = [
    {
      title: '贵州茅台 600519',
      summary: '业绩稳健增长，直销渠道占比提升，品牌护城河深厚，中长期持有逻辑不变。',
      sentiment: 'positive',
      time: '今天 09:30',
    },
    {
      title: '宁德时代 300750',
      summary: '短期受锂价下跌影响，海外产能扩张不及预期，但长期新能源赛道确定性强。',
      sentiment: 'neutral',
      time: '今天 10:15',
    },
    {
      title: '市场分析：A股周报',
      summary: '本周北向资金净流入85亿，科技板块表现活跃，消费板块估值回归合理区间。',
      sentiment: 'positive',
      time: '昨天 18:00',
    },
  ];

  sentimentLabel(s: AnalysisItem['sentiment']): string {
    return { positive: '看多', negative: '看空', neutral: '中性' }[s];
  }
}
