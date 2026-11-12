import ReactEChartsCore from 'echarts-for-react/lib/core';
import * as echarts from 'echarts/core';
import { LineChart as ELineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { useMemo } from 'react';

/**
 * 按需注册 echarts 模块。
 * 默认 `import ReactECharts from 'echarts-for-react'` 会把整个 echarts 打进包里，
 * 实测单包 1.7MB。这里只注册折线图必需的四件套，体积能砍掉一半以上。
 */
echarts.use([ELineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

type SeriesDef = {
  name: string;
  data: (number | null)[];
  color: string;
  area?: boolean;
  yAxisIndex?: number;
};

interface Props {
  timestamps: number[];
  series: SeriesDef[];
  height?: number | string;
  yMax?: number;
  yUnit?: string;
  /** 自定义 Y 轴标签格式（优先于 yUnit），例如把字节数显示成 12M */
  yFormatter?: (v: number) => string;
  /** 自定义 tooltip 数值格式 */
  valueFormatter?: (v: number, seriesName: string) => string;
  /** 右侧第二条 Y 轴（例如网络速率） */
  y2Max?: number;
  y2Unit?: string;
  showRightAxis?: boolean;
}

const AXIS_LABEL = { color: '#a8b0bd', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' };
const SPLIT_LINE = { lineStyle: { color: 'rgba(16,24,40,0.07)', type: 'dashed' as const } };

/**
 * 统一风格的折线图容器。
 * 所有图表共享同一套坐标轴样式、网格与 tooltip，避免每个页面各写一套导致视觉不一致。
 */
export function LineChart({
  timestamps,
  series,
  height = 180,
  yMax,
  yUnit = '',
  yFormatter,
  valueFormatter,
  y2Max,
  y2Unit = '',
  showRightAxis = false,
}: Props) {
  const option = useMemo(
    () => ({
      animation: true,
      animationDuration: 320,
      animationEasing: 'cubicOut' as const,
      backgroundColor: 'transparent',
      grid: {
        left: 6,
        right: showRightAxis ? 6 : 10,
        top: 12,
        bottom: 2,
        containLabel: true,
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: 'rgba(255,255,255,0.98)',
        borderColor: 'rgba(16,24,40,0.09)',
        borderWidth: 1,
        padding: [7, 10],
        // 背景已是 98% 不透明，backdrop-filter 没有任何视觉贡献；
        // 但 tooltip 跟随鼠标移动时会逐帧重算模糊，软件渲染下是纯开销。别加回来。
        extraCssText: 'border-radius:9px;box-shadow:0 12px 30px -12px rgba(16,24,40,0.28);',
        textStyle: { color: '#12171f', fontSize: 11 },
        axisPointer: {
          type: 'line' as const,
          lineStyle: { color: 'rgba(15,157,112,0.35)', width: 1, type: 'dashed' as const },
        },
        formatter: (params: any[]) => {
          if (!params?.length) return '';
          const t = new Date(params[0].axisValue);
          const hh = String(t.getHours()).padStart(2, '0');
          const mm = String(t.getMinutes()).padStart(2, '0');
          const ss = String(t.getSeconds()).padStart(2, '0');
          const rows = params
            .map((p) => {
              const v =
                p.value === null || p.value === undefined
                  ? '—'
                  : valueFormatter
                    ? valueFormatter(Number(p.value), p.seriesName)
                    : `${Number(p.value).toFixed(1)}${yUnit}`;
              return `<div style="display:flex;align-items:center;gap:6px;margin-top:3px">
                <span style="width:6px;height:6px;border-radius:99px;background:${p.color};display:inline-block"></span>
                <span style="color:#5b6473">${p.seriesName}</span>
                <span style="margin-left:auto;font-family:monospace;color:#12171f">${v}</span>
              </div>`;
            })
            .join('');
          return `<div style="font-family:monospace;color:#8b94a3;font-size:10px">${hh}:${mm}:${ss}</div>${rows}`;
        },
      },
      xAxis: {
        type: 'category' as const,
        data: timestamps.map((t) => new Date(t).toISOString()),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          ...AXIS_LABEL,
          interval: Math.max(0, Math.floor(timestamps.length / 6) - 1),
          formatter: (v: string) => {
            const d = new Date(v);
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          },
        },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value' as const,
          min: 0,
          max: yMax,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            ...AXIS_LABEL,
            formatter: (v: number) => (yFormatter ? yFormatter(v) : `${v}${yUnit}`),
          },
          splitLine: SPLIT_LINE,
        },
        ...(showRightAxis
          ? [
              {
                type: 'value' as const,
                min: 0,
                max: y2Max,
                position: 'right' as const,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: { ...AXIS_LABEL, formatter: (v: number) => `${v}${y2Unit}` },
                splitLine: { show: false },
              },
            ]
          : []),
      ],
      series: series.map((s) => ({
        name: s.name,
        type: 'line' as const,
        data: s.data,
        smooth: 0.34,
        symbol: 'none' as const,
        lineStyle: { width: 1.8, color: s.color },
        itemStyle: { color: s.color },
        yAxisIndex: s.yAxisIndex ?? 0,
        areaStyle: s.area
          ? {
              color: {
                type: 'linear' as const,
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: `${s.color}38` },
                  { offset: 1, color: `${s.color}00` },
                ],
              },
            }
          : undefined,
        connectNulls: false,
      })),
    }),
    [timestamps, series, yMax, yUnit, yFormatter, valueFormatter, y2Max, y2Unit, showRightAxis],
  );

  return (
    <div className="flex-1 min-h-0 w-full">
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        lazyUpdate
      />
    </div>
  );
}
