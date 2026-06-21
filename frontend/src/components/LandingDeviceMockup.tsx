import type { ReactNode } from 'react';

type LandingDeviceMockupProps = {
  children: ReactNode;
  className?: string;
};

export default function LandingDeviceMockup({ children, className }: LandingDeviceMockupProps) {
  return (
    <div className={['landing-device-mockup', className].filter(Boolean).join(' ')}>
      <div className="landing-device-mockup-bezel">
        <div className="landing-device-mockup-toolbar" aria-hidden="true">
          <span className="landing-device-mockup-dot" />
          <span className="landing-device-mockup-dot" />
          <span className="landing-device-mockup-dot" />
        </div>
        <div className="landing-device-mockup-screen">{children}</div>
      </div>
      <div className="landing-device-mockup-chin" aria-hidden="true" />
      <div className="landing-device-mockup-stand" aria-hidden="true" />
    </div>
  );
}
