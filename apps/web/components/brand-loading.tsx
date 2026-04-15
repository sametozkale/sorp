interface BrandLoadingProps {
  label?: string;
  fullScreen?: boolean;
}

export function BrandLoading({
  label = "Loading...",
  fullScreen = false,
}: BrandLoadingProps) {
  const containerClassName = fullScreen
    ? "fixed inset-0 z-50 flex items-center justify-center"
    : "w-full min-h-[60vh] flex items-center justify-center";
  const containerStyle = fullScreen
    ? { width: "100dvw", height: "100dvh" }
    : undefined;

  return (
    <div className={containerClassName} style={containerStyle}>
      <div className="inline-flex items-center gap-2 text-sm font-medium text-[#777]">
        <svg
          width="18"
          height="18"
          viewBox="0 0 40 40"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
          className="shrink-0"
        >
          <g clipPath="url(#brand-loading-clip)">
            <rect
              x="15.6024"
              y="15.6002"
              width="8.79518"
              height="8.79518"
              rx="1.93976"
              fill="#22D3BB"
              stroke="#22D3BB"
              strokeWidth="0.120482"
            />
            <path
              d="M10.9156 0.0605469H15.8317C16.9028 0.0607377 17.7709 0.928819 17.7711 2V8.85547H10.9156C9.84435 8.85528 8.9762 7.98703 8.9762 6.91602V2C8.9762 0.928701 9.84435 0.0605473 10.9156 0.0605469Z"
              fill="#22D3BB"
              stroke="#22D3BB"
              strokeWidth="0.120482"
            />
            <path
              d="M2 8.9762H8.85547V15.8317C8.85528 16.9027 7.98703 17.7709 6.91602 17.7711H2C0.928819 17.7711 0.0607375 16.9028 0.0605469 15.8317V10.9156C0.0605473 9.84435 0.928701 8.9762 2 8.9762Z"
              fill="#22D3BB"
              stroke="#22D3BB"
              strokeWidth="0.120482"
            />
            <path
              d="M38.0004 8.9762C39.0715 8.97639 39.9398 9.84447 39.9398 10.9156V15.8317C39.9396 16.9027 39.0714 17.7709 38.0004 17.7711H33.0844C32.0132 17.7711 31.1451 16.9028 31.1449 15.8317V8.9762H38.0004Z"
              fill="#22D3BB"
              stroke="#22D3BB"
              strokeWidth="0.120482"
            />
            <path
              d="M33.0844 22.1405H38.0004C39.0715 22.1407 39.9398 23.0088 39.9398 24.08V28.996C39.9396 30.067 39.0714 30.9353 38.0004 30.9355H31.1449V24.08C31.1449 23.0087 32.0131 22.1405 33.0844 22.1405Z"
              fill="#22D3BB"
              stroke="#22D3BB"
              strokeWidth="0.120482"
            />
            <path
              d="M24.1687 31.0605H31.0242V37.916C31.024 38.987 30.1558 39.8553 29.0847 39.8555H24.1687C23.0976 39.8555 22.2295 38.9872 22.2293 37.916V33C22.2293 31.9287 23.0974 31.0605 24.1687 31.0605Z"
              fill="#22D3BB"
              stroke="#22D3BB"
              strokeWidth="0.120482"
            />
            <path
              d="M15.8317 31.0605C16.9028 31.0607 17.7711 31.9288 17.7711 33V37.916C17.771 38.987 16.9027 39.8553 15.8317 39.8555H10.9157C9.8445 39.8555 8.97642 38.9872 8.97623 37.916V31.0605H15.8317Z"
              fill="#22D3BB"
              stroke="#22D3BB"
              strokeWidth="0.120482"
            />
            <path
              d="M2 22.1405H6.91602C7.98715 22.1407 8.85547 23.0088 8.85547 24.08V30.9355H2C0.928819 30.9355 0.0607375 30.0671 0.0605469 28.996V24.08C0.0605473 23.0087 0.928701 22.1405 2 22.1405Z"
              fill="#22D3BB"
              stroke="#22D3BB"
              strokeWidth="0.120482"
            />
            <path
              d="M24.1687 0.0605469H29.0847C30.1559 0.060738 31.0242 0.928819 31.0242 2V8.85547H24.1687C23.0976 8.85547 22.2295 7.98715 22.2293 6.91602V2C22.2293 0.928701 23.0974 0.0605469 24.1687 0.0605469Z"
              fill="#22D3BB"
              stroke="#22D3BB"
              strokeWidth="0.120482"
            />
          </g>
          <defs>
            <clipPath id="brand-loading-clip">
              <rect width="40" height="40" fill="white" />
            </clipPath>
          </defs>
        </svg>
        <span>{label}</span>
      </div>
    </div>
  );
}
