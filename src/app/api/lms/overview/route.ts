import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Learning & Onboarding payload for the LMS screen (Kim's lms_view design):
 * courses (learn_programs + learn_units), learners (learn_v_roster), and
 * certifications (enrollments carrying a certificate_number).
 */
export async function GET() {
  const db = supabaseAdmin();
  try {
    const [{ data: programs }, { data: units }, { data: roster }, { data: dueRows }] = await Promise.all([
      db.from('learn_programs').select('id, code, title, kind, description, status, duration_minutes, credits, certificate_valid_days, created_at').eq('tenant_id', DEFAULT_TENANT_ID).order('created_at', { ascending: false }),
      db.from('learn_units').select('id, program_id, seq, title, unit_type, duration_minutes, status').eq('tenant_id', DEFAULT_TENANT_ID).order('seq'),
      db.from('learn_v_roster').select('enrollment_id, program_id, program, cohort, status, progress_pct, enrolled_at, completed_at, certificate_number, certificate_expires_at, participant_name, participant_identifier').eq('tenant_id', DEFAULT_TENANT_ID).order('enrolled_at', { ascending: false }),
      db.from('learn_enrollments').select('id, status, expires_at').eq('tenant_id', DEFAULT_TENANT_ID),
    ]);

    const unitsByProgram = new Map<string, { id: string; seq: number | null; title: string; unit_type: string | null; duration_minutes: number | null }[]>();
    for (const u of units || []) {
      const list = unitsByProgram.get(u.program_id) || [];
      list.push({ id: u.id, seq: u.seq, title: u.title, unit_type: u.unit_type, duration_minutes: u.duration_minutes });
      unitsByProgram.set(u.program_id, list);
    }

    const rosterRows = roster || [];
    const courses = (programs || []).map((p) => {
      const rs = rosterRows.filter((r) => r.program_id === p.id);
      const enrolled = rs.length;
      const completed = rs.filter((r) => r.status === 'completed').length;
      const avgProgress = enrolled ? Math.round(rs.reduce((s, r) => s + Number(r.progress_pct || 0), 0) / enrolled) : 0;
      const lessons = unitsByProgram.get(p.id) || [];
      return {
        id: p.id, code: p.code, title: p.title, kind: p.kind, description: p.description,
        status: p.status, duration_minutes: p.duration_minutes ?? lessons.reduce((s, l) => s + (l.duration_minutes || 0), 0) ?? null,
        lessons_total: lessons.length, lessons, enrolled, completed, avg_progress: avgProgress,
      };
    });

    const dueByEnrollment = new Map((dueRows || []).map((r) => [r.id, r.expires_at]));
    const learners = rosterRows.map((r) => ({
      enrollment_id: r.enrollment_id, learner: r.participant_name || r.participant_identifier || '—',
      course: r.program, cohort: r.cohort, enrolled_at: r.enrolled_at, progress: Number(r.progress_pct || 0),
      status: r.status, completed_at: r.completed_at, due_at: dueByEnrollment.get(r.enrollment_id) || null,
    }));

    const certifications = rosterRows
      .filter((r) => r.certificate_number)
      .map((r) => ({
        name: r.program, holder: r.participant_name || r.participant_identifier || '—',
        number: r.certificate_number, issued_at: r.completed_at, expires_at: r.certificate_expires_at,
        status: r.certificate_expires_at && new Date(r.certificate_expires_at).getTime() < Date.now() ? 'expired' : 'active',
      }));

    const activeLearners = new Set(rosterRows.filter((r) => r.status !== 'withdrawn').map((r) => r.participant_name || r.participant_identifier)).size;
    const completionRate = rosterRows.length ? Math.round((rosterRows.filter((r) => r.status === 'completed').length / rosterRows.length) * 100) : 0;

    return NextResponse.json({
      data: {
        kpis: {
          published_courses: courses.filter((c) => c.status === 'published').length,
          active_learners: activeLearners,
          completion_rate: completionRate,
          // Overdue counts enrollments past their expires_at that are not
          // completed/withdrawn. If no enrollment carries a due date at
          // all, the count is unknown — rendered as —, never as zero.
          overdue: (() => {
            const dated = (dueRows || []).filter((r) => r.expires_at);
            if (!dated.length) return null;
            return dated.filter((r) => r.status !== 'completed' && r.status !== 'withdrawn' && new Date(r.expires_at as string).getTime() < Date.now()).length;
          })(),
        },
        courses, learners, certifications,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: { code: 'LMS_OVERVIEW_FAILED', message: e instanceof Error ? e.message : 'Failed' } }, { status: 500 });
  }
}
