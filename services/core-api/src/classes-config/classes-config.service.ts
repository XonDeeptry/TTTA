import { BadRequestException, Injectable } from '@nestjs/common';
import { ClassConfig } from '@prisma/client';
import { PrismaService } from '../prisma.service';

export type ClassOverviewWarning = 'multiple_courses' | 'pin_other_course' | 'no_criteria' | 'no_students';

export interface ClassOverview {
  className: string;
  studentCount: number;
  courses: { id: number; key: string }[];
  config: { advisorZaloId: string; autoSend: boolean; criteriaId: number | null; readingText: string | null } | null;
  /** Bộ tiêu chí grading-worker SẼ dùng cho học viên lớp này; null khi không xác định được một bộ duy nhất. */
  effective: {
    id: number;
    title: string;
    version: number;
    templateKey: string | null;
    source: 'pinned' | 'course_latest';
  } | null;
  warnings: ClassOverviewWarning[];
}

function pick(c: { id: number; title: string; version: number; templateKey: string | null }) {
  return { id: c.id, title: c.title, version: c.version, templateKey: c.templateKey };
}

@Injectable()
export class ClassesConfigService {
  constructor(private readonly prisma: PrismaService) {}

  list(): Promise<ClassConfig[]> {
    return this.prisma.classConfig.findMany({ orderBy: { className: 'asc' } });
  }

  /**
   * MỌI lớp đang có học viên (kể cả lớp chưa có `classes_config`) cùng bộ tiêu chí đang áp dụng.
   *
   * Pilot 2026-09-15: bảng cấu hình chỉ liệt kê hàng `classes_config`, nên khi bảng rỗng đội học
   * thuật không biết lớp nào đang chấm bằng bộ tiêu chí nào. Luật chọn ở đây PHẢI trùng
   * `worker-api.controller.ts#criteria`: ghim chỉ có hiệu lực khi thuộc đúng khóa, không thì bản
   * mới nhất của khóa — hiển thị một luật khác với luật chấm thật còn tệ hơn không hiển thị.
   */
  async overview(): Promise<ClassOverview[]> {
    const [groups, configs, courses, criteria] = await Promise.all([
      this.prisma.student.groupBy({ by: ['className', 'courseId'], _count: { _all: true } }),
      this.prisma.classConfig.findMany(),
      this.prisma.course.findMany({ select: { id: true, key: true } }),
      this.prisma.criteria.findMany({
        select: { id: true, courseId: true, title: true, version: true, templateKey: true },
        orderBy: { version: 'desc' },
      }),
    ]);

    const courseKey = new Map(courses.map((c) => [c.id, c.key]));
    const criteriaById = new Map(criteria.map((c) => [c.id, c]));
    const latestByCourse = new Map<number, (typeof criteria)[number]>();
    for (const c of criteria) if (!latestByCourse.has(c.courseId)) latestByCourse.set(c.courseId, c);
    const configByClass = new Map(configs.map((c) => [c.className, c]));

    const byClass = new Map<string, { studentCount: number; courseIds: Set<number> }>();
    for (const g of groups) {
      if (!g.className) continue; // học viên chưa xếp lớp không có cấu hình lớp để hiển thị
      const entry = byClass.get(g.className) ?? { studentCount: 0, courseIds: new Set<number>() };
      entry.studentCount += g._count._all;
      if (g.courseId != null) entry.courseIds.add(g.courseId);
      byClass.set(g.className, entry);
    }
    for (const cfg of configs) {
      if (!byClass.has(cfg.className)) byClass.set(cfg.className, { studentCount: 0, courseIds: new Set() });
    }

    return [...byClass.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([className, { studentCount, courseIds }]) => {
        const cfg = configByClass.get(className) ?? null;
        const warnings: ClassOverviewWarning[] = [];
        let effective: ClassOverview['effective'] = null;

        if (studentCount === 0) warnings.push('no_students');
        if (courseIds.size > 1) warnings.push('multiple_courses');
        if (courseIds.size === 1) {
          const courseId = [...courseIds][0];
          const pinned = cfg?.criteriaId != null ? criteriaById.get(cfg.criteriaId) : undefined;
          if (pinned && pinned.courseId === courseId) {
            effective = { ...pick(pinned), source: 'pinned' };
          } else {
            if (cfg?.criteriaId != null) warnings.push('pin_other_course');
            const latest = latestByCourse.get(courseId);
            if (latest) effective = { ...pick(latest), source: 'course_latest' };
            else warnings.push('no_criteria');
          }
        }

        return {
          className,
          studentCount,
          courses: [...courseIds].map((id) => ({ id, key: courseKey.get(id) ?? `#${id}` })),
          config: cfg
            ? {
                advisorZaloId: cfg.advisorZaloId,
                autoSend: cfg.autoSend,
                criteriaId: cfg.criteriaId,
                readingText: cfg.readingText ?? null,
              }
            : null,
          effective,
          warnings,
        };
      });
  }

  /**
   * `criteriaId`: undefined = giữ nguyên · null = gỡ ghim (về fallback theo khóa) · số = ghim.
   * `readingText`: undefined = giữ nguyên · null/chuỗi rỗng = xóa · chuỗi = bài đọc mới (D151).
   * Kiểm tra tồn tại TRƯỚC khi ghi để trả 400 có nội dung, thay vì để Postgres ném lỗi khóa
   * ngoại (P2003) rồi Nest dịch thành 500 vô nghĩa với người dùng dashboard.
   */
  async upsert(
    className: string,
    advisorZaloId: string,
    autoSend?: boolean,
    criteriaId?: number | null,
    readingText?: string | null,
  ): Promise<ClassConfig> {
    if (criteriaId !== undefined && criteriaId !== null) {
      const exists = await this.prisma.criteria.findUnique({
        where: { id: criteriaId },
        select: { id: true },
      });
      if (!exists) throw new BadRequestException(`criteria ${criteriaId} không tồn tại`);
    }
    const reading = readingText === undefined ? undefined : readingText?.trim() ? readingText.trim() : null;
    return this.prisma.classConfig.upsert({
      where: { className },
      create: {
        className,
        advisorZaloId,
        autoSend: autoSend ?? false,
        criteriaId: criteriaId ?? null,
        ...(reading !== undefined ? { readingText: reading } : {}),
      },
      update: {
        advisorZaloId,
        ...(autoSend !== undefined ? { autoSend } : {}),
        ...(criteriaId !== undefined ? { criteriaId } : {}),
        ...(reading !== undefined ? { readingText: reading } : {}),
      },
    });
  }
}
