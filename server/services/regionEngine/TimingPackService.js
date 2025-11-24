/**
 * Timing Pack Service
 * Sprint 73: Region-Aware Scoring & Timing Packs
 *
 * Manages optimal contact timing, days, and frequency per region
 */

import { regionRegistry } from './RegionRegistry.js';
import { DEFAULT_TIMING_PACK, WORK_DAYS } from './types.js';

class TimingPackService {
  /**
   * Get optimal contact timing for a region
   * @param {string} regionId - Region ID
   * @param {string} packName - Timing pack name (default: 'default')
   * @returns {Promise<Object>}
   */
  async getOptimalTiming(regionId, packName = 'default') {
    const pack = await regionRegistry.getTimingPack(regionId, packName);
    const region = await regionRegistry.getRegionById(regionId);

    if (!pack) {
      return {
        ...DEFAULT_TIMING_PACK,
        region_id: regionId,
        pack_name: packName,
        source: 'default'
      };
    }

    return {
      region_id: regionId,
      region_code: region?.region_code || 'UNKNOWN',
      pack_name: pack.pack_name,
      timezone: region?.timezone || 'UTC',

      // Timing configuration
      optimal_days: pack.optimal_days,
      optimal_days_names: pack.optimal_days.map(d => this._dayToName(d)),
      optimal_hours: {
        start: pack.optimal_hours_start,
        end: pack.optimal_hours_end,
        duration_hours: this._calculateDuration(pack.optimal_hours_start, pack.optimal_hours_end)
      },

      // Frequency configuration
      frequency: {
        contact_every_days: pack.contact_frequency_days,
        follow_up_delay: pack.follow_up_delay_days,
        max_attempts: pack.max_attempts
      },

      // Work week from region
      work_week: {
        start: region?.work_week_start ?? 1,
        end: region?.work_week_end ?? 5,
        start_name: this._dayToName(region?.work_week_start ?? 1),
        end_name: this._dayToName(region?.work_week_end ?? 5)
      },

      source: 'database'
    };
  }

  /**
   * Calculate next optimal contact time
   * @param {string} regionId - Region ID
   * @param {Date} fromDate - Starting date (default: now)
   * @returns {Promise<Object>}
   */
  async getNextOptimalTime(regionId, fromDate = new Date()) {
    const timing = await this.getOptimalTiming(regionId);

    // Convert to region timezone
    const regionDate = this._toTimezone(fromDate, timing.timezone);
    const currentDay = regionDate.getDay();
    const currentTime = this._getTimeString(regionDate);

    // Find next optimal day
    let daysToAdd = 0;
    let nextDay = currentDay;

    // Check if today is optimal and still within hours
    const isTodayOptimal = timing.optimal_days.includes(currentDay);
    const isWithinHours = currentTime >= timing.optimal_hours.start &&
                          currentTime < timing.optimal_hours.end;

    if (isTodayOptimal && isWithinHours) {
      // Now is a good time
      return {
        next_optimal: fromDate,
        is_now_optimal: true,
        days_until: 0,
        region_id: regionId,
        timing
      };
    }

    // Find next optimal day
    for (let i = 1; i <= 7; i++) {
      nextDay = (currentDay + i) % 7;
      if (timing.optimal_days.includes(nextDay)) {
        daysToAdd = i;
        break;
      }
    }

    // If today is optimal but past hours, check if we should use today + 1 day
    // or wait for next optimal day
    if (isTodayOptimal && currentTime >= timing.optimal_hours.end && daysToAdd > 1) {
      // Wait until next optimal day at start time
    }

    // Calculate next optimal datetime
    const nextDate = new Date(fromDate);
    nextDate.setDate(nextDate.getDate() + daysToAdd);

    // Set to optimal start time
    const [startHour, startMin] = timing.optimal_hours.start.split(':').map(Number);
    nextDate.setHours(startHour, startMin, 0, 0);

    return {
      next_optimal: nextDate,
      next_optimal_local: this._toTimezone(nextDate, timing.timezone),
      is_now_optimal: false,
      days_until: daysToAdd,
      day_name: this._dayToName(nextDay),
      time_range: `${timing.optimal_hours.start} - ${timing.optimal_hours.end}`,
      region_id: regionId,
      timing
    };
  }

  /**
   * Generate follow-up schedule based on region timing
   * @param {string} regionId - Region ID
   * @param {Date} startDate - Initial contact date
   * @param {number} numFollowUps - Number of follow-ups to schedule
   * @returns {Promise<Object[]>}
   */
  async generateFollowUpSchedule(regionId, startDate = new Date(), numFollowUps = 5) {
    const timing = await this.getOptimalTiming(regionId);
    const schedule = [];

    let currentDate = new Date(startDate);

    // Initial contact
    const initialOptimal = await this.getNextOptimalTime(regionId, currentDate);
    schedule.push({
      sequence: 1,
      type: 'initial_contact',
      scheduled_date: initialOptimal.next_optimal,
      day_name: this._dayToName(initialOptimal.next_optimal.getDay()),
      time_range: `${timing.optimal_hours.start} - ${timing.optimal_hours.end}`,
      notes: 'Initial outreach'
    });

    currentDate = initialOptimal.next_optimal;

    // Follow-ups
    for (let i = 0; i < numFollowUps; i++) {
      // Add follow-up delay
      currentDate = new Date(currentDate);
      currentDate.setDate(currentDate.getDate() + timing.frequency.follow_up_delay);

      // Find next optimal time after delay
      const nextOptimal = await this.getNextOptimalTime(regionId, currentDate);

      schedule.push({
        sequence: i + 2,
        type: i < numFollowUps - 1 ? 'follow_up' : 'final_follow_up',
        scheduled_date: nextOptimal.next_optimal,
        day_name: this._dayToName(nextOptimal.next_optimal.getDay()),
        time_range: `${timing.optimal_hours.start} - ${timing.optimal_hours.end}`,
        days_since_initial: Math.ceil(
          (nextOptimal.next_optimal - schedule[0].scheduled_date) / (1000 * 60 * 60 * 24)
        ),
        notes: i === 0 ? 'First follow-up' : `Follow-up #${i + 1}`
      });

      currentDate = nextOptimal.next_optimal;
    }

    return {
      region_id: regionId,
      region_code: timing.region_code,
      total_duration_days: Math.ceil(
        (schedule[schedule.length - 1].scheduled_date - schedule[0].scheduled_date) / (1000 * 60 * 60 * 24)
      ),
      schedule,
      timing_config: {
        frequency_days: timing.frequency.contact_every_days,
        follow_up_delay: timing.frequency.follow_up_delay,
        max_attempts: timing.frequency.max_attempts,
        optimal_days: timing.optimal_days_names,
        optimal_hours: timing.optimal_hours
      }
    };
  }

  /**
   * Check if current time is within optimal window
   * @param {string} regionId - Region ID
   * @param {Date} checkDate - Date to check (default: now)
   * @returns {Promise<Object>}
   */
  async isOptimalTime(regionId, checkDate = new Date()) {
    const timing = await this.getOptimalTiming(regionId);

    // Convert to region timezone
    const regionDate = this._toTimezone(checkDate, timing.timezone);
    const currentDay = regionDate.getDay();
    const currentTime = this._getTimeString(regionDate);

    const isOptimalDay = timing.optimal_days.includes(currentDay);
    const isWithinHours = currentTime >= timing.optimal_hours.start &&
                          currentTime < timing.optimal_hours.end;
    const isWorkDay = currentDay >= timing.work_week.start &&
                      currentDay <= timing.work_week.end;

    return {
      is_optimal: isOptimalDay && isWithinHours,
      is_work_day: isWorkDay,
      is_optimal_day: isOptimalDay,
      is_within_hours: isWithinHours,
      current_day: this._dayToName(currentDay),
      current_time: currentTime,
      timezone: timing.timezone,
      region_id: regionId,
      recommendation: this._getTimingRecommendation(isOptimalDay, isWithinHours, isWorkDay)
    };
  }

  /**
   * Compare timing across regions
   * @param {string[]} regionIds - Region IDs to compare
   * @returns {Promise<Object>}
   */
  async compareTiming(regionIds) {
    const comparisons = [];

    for (const regionId of regionIds) {
      const timing = await this.getOptimalTiming(regionId);
      comparisons.push({
        region_id: regionId,
        region_code: timing.region_code,
        timezone: timing.timezone,
        work_week: timing.work_week,
        optimal_days: timing.optimal_days_names,
        optimal_hours: timing.optimal_hours,
        frequency: timing.frequency
      });
    }

    // Find overlapping optimal windows
    const overlaps = this._findTimingOverlaps(comparisons);

    return {
      regions: comparisons,
      overlapping_windows: overlaps,
      recommendation: overlaps.length > 0
        ? `Best cross-region contact window: ${overlaps[0].window}`
        : 'No overlapping optimal windows found - schedule region-specific outreach'
    };
  }

  /**
   * Convert day number to name
   * @private
   */
  _dayToName(day) {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day] || 'Unknown';
  }

  /**
   * Get time string from date
   * @private
   */
  _getTimeString(date) {
    return date.toTimeString().slice(0, 8);
  }

  /**
   * Calculate duration between times
   * @private
   */
  _calculateDuration(start, end) {
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    return (endH * 60 + endM - startH * 60 - startM) / 60;
  }

  /**
   * Convert date to timezone
   * @private
   */
  _toTimezone(date, timezone) {
    try {
      return new Date(date.toLocaleString('en-US', { timeZone: timezone }));
    } catch {
      return date;
    }
  }

  /**
   * Get timing recommendation
   * @private
   */
  _getTimingRecommendation(isOptimalDay, isWithinHours, isWorkDay) {
    if (isOptimalDay && isWithinHours) {
      return 'Excellent time for outreach';
    }
    if (isWorkDay && isWithinHours) {
      return 'Good time - work hours but not optimal day';
    }
    if (isWorkDay) {
      return 'Work day but outside optimal hours - consider scheduling';
    }
    return 'Outside work hours - schedule for next business day';
  }

  /**
   * Find timing overlaps between regions
   * @private
   */
  _findTimingOverlaps(comparisons) {
    if (comparisons.length < 2) return [];

    const overlaps = [];

    // Simple overlap detection - find common days
    const commonDays = comparisons[0].optimal_days.filter(day =>
      comparisons.every(c => c.optimal_days.includes(day))
    );

    if (commonDays.length > 0) {
      // Find overlapping hours (simplified - assumes same timezone for overlap)
      overlaps.push({
        days: commonDays,
        window: `${commonDays.join(', ')} - Check regional hours`,
        regions: comparisons.map(c => c.region_code)
      });
    }

    return overlaps;
  }
}

// Singleton instance
export const timingPackService = new TimingPackService();
export default timingPackService;
