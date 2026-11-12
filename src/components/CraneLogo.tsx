import type { SVGProps } from 'react';

export function CraneLogo({ size = 20, className, ...props }: { size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      {...props}
    >
      {/* 渐变定义 */}
      <defs>
        <linearGradient id="crane-body" x1="8" y1="12" x2="56" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0f9d70" />
          <stop offset="0.5" stopColor="#0891a8" />
          <stop offset="1" stopColor="#7454d8" />
        </linearGradient>
        <linearGradient id="crane-wing-left" x1="16" y1="6" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id="crane-wing-right" x1="48" y1="10" x2="32" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.5" />
        </linearGradient>
      </defs>

      {/* 现代折纸鹤 Origami Crane 轮廓 */}
      {/* 尾羽与下身 */}
      <polygon points="32,46 14,40 32,58" fill="url(#crane-wing-right)" opacity="0.85" />
      {/* 右翼（背景翼） */}
      <polygon points="32,28 54,10 40,38" fill="url(#crane-wing-right)" />
      {/* 鹤颈与头部 */}
      <polygon points="32,28 12,18 20,12 26,20" fill="url(#crane-wing-left)" />
      {/* 丹顶红点（红鹤特征点睛） */}
      <circle cx="15" cy="14" r="2.2" fill="#dc2f4b" />
      {/* 左翼（主翼前方） */}
      <polygon points="32,28 8,6 28,42" fill="url(#crane-wing-left)" />
      {/* 躯干中心脊线折面 */}
      <polygon points="32,28 28,42 38,36" fill="#ffffff" opacity="0.92" />
    </svg>
  );
}
