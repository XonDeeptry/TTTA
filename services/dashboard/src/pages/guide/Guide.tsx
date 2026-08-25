import { useTranslation } from 'react-i18next';
import { Alert } from '../../components/ui/alert';
import { Badge } from '../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import {
  GUIDE_SECTION_ORDER,
  GuideCallout,
  GuideSection,
  GuideStep,
  guideEn,
  guideVi,
} from './guide-content';

/**
 * Màn "Hướng dẫn" — trang đọc, không có trạng thái, không gọi API.
 *
 * Mọi vai trò đều xem được (kể cả staff chưa có quyền soạn): người CHƯA có quyền chính là người
 * cần đọc mục 3 để biết phải xin quyền gì — giấu trang này khỏi họ là đúng cái bẫy "dead end" mà
 * F12-ux đã cảnh báo.
 *
 * Văn xuôi nằm ở `guide-content.ts`; ở đây chỉ có cách trình bày.
 */

/** Nhãn nút/trường THẬT, lấy từ i18n để hướng dẫn không trôi khi ai đó đổi chữ trên giao diện. */
function UiChips({ keys }: { keys: string[] }) {
  const { t } = useTranslation();
  // Bỏ qua khóa còn placeholder (`{{...}}`) — ở đây không có giá trị để truyền, render ra sẽ là
  // chuỗi cụt. Thà thiếu một chip còn hơn hiện chữ hỏng cho giáo viên đọc.
  const labels = keys.map((k) => [k, t(k)] as const).filter(([, label]) => !label.includes('{{'));
  if (labels.length === 0) return null;
  return (
    <p className="flex flex-wrap items-center gap-1.5">
      {labels.map(([k, label]) => (
        <Badge key={k} variant="outline" className="font-normal">
          {label}
        </Badge>
      ))}
    </p>
  );
}

function Callout({ callout }: { callout: GuideCallout }) {
  return (
    <Alert variant={callout.kind === 'warn' ? 'warning' : 'default'} className="mt-3">
      {callout.text}
    </Alert>
  );
}

function Step({ step, index }: { step: GuideStep; index: number }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-caption font-medium text-primary"
      >
        {index + 1}
      </span>
      <div className="min-w-0 space-y-2">
        <h3 className="text-body font-medium">{step.title}</h3>
        {step.body.map((p) => (
          <p key={p} className="text-body text-foreground/80">
            {p}
          </p>
        ))}
        {step.uiKeys && <UiChips keys={step.uiKeys} />}
        {step.callout && <Callout callout={step.callout} />}
      </div>
    </li>
  );
}

function Section({ id, section }: { id: string; section: GuideSection }) {
  return (
    <Card id={id} className="scroll-mt-4">
      <CardHeader>
        <CardTitle>{section.heading}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {section.intro?.map((p) => (
          <p key={p} className="text-body text-foreground/80">
            {p}
          </p>
        ))}

        {section.terms && (
          <dl className="space-y-3">
            {section.terms.map((item) => (
              <div key={item.term} className="rounded-md border border-border bg-muted/40 p-3">
                <dt className="text-body font-medium">{item.term}</dt>
                <dd className="mt-1 text-body text-foreground/80">{item.desc}</dd>
              </div>
            ))}
          </dl>
        )}

        {section.steps && (
          <ol className="space-y-5">
            {section.steps.map((step, i) => (
              <Step key={step.title} step={step} index={i} />
            ))}
          </ol>
        )}

        {section.callout && <Callout callout={section.callout} />}
      </CardContent>
    </Card>
  );
}

export function Guide() {
  const { i18n } = useTranslation();
  // Chọn theo tiền tố nên 'en-US' vẫn ra bản tiếng Anh; mặc định về tiếng Việt như phần còn lại.
  const content = i18n.language?.startsWith('en') ? guideEn : guideVi;

  return (
    <main id="main-content" className="space-y-6 p-6">
      <div className="max-w-3xl space-y-2">
        <h1 className="text-h1">{content.title}</h1>
        <p className="text-body text-foreground/80">{content.lead}</p>
      </div>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>{content.tocHeading}</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-1">
            {GUIDE_SECTION_ORDER.map((key) => (
              <li key={key}>
                <a
                  href={`#guide-${key}`}
                  className="text-body text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  {content.sections[key].heading}
                </a>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <div className="max-w-3xl space-y-6">
        {GUIDE_SECTION_ORDER.map((key) => (
          <Section key={key} id={`guide-${key}`} section={content.sections[key]} />
        ))}
      </div>
    </main>
  );
}
