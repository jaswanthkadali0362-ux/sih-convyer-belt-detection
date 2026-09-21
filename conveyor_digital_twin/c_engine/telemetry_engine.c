/**
 * @file telemetry_engine.c
 * @brief Implementation of Industrial Conveyor Condition Monitoring Engine
 */

#include "telemetry_engine.h"
#include <stdio.h>
#include <string.h>
#include <math.h>

static void init_channel(SensorChannel_t* ch, float default_val, float warn_lim, float crit_lim) {
    ch->raw_value = default_val;
    ch->filtered_value = default_val;
    ch->warning_limit = warn_lim;
    ch->critical_limit = crit_lim;
    ch->buffer_idx = 0;
    ch->status = SEVERITY_NORMAL;
    for (int i = 0; i < FILTER_WINDOW_SIZE; i++) {
        ch->buffer[i] = default_val;
    }
}

void telemetry_init(ConveyorSystemState_t* state) {
    if (!state) return;
    memset(state, 0, sizeof(ConveyorSystemState_t));

    /* 1. Misalignment Channels (Limits matched to ABB standard) */
    init_channel(&state->misalignment_st01, 2.80f, 40.0f, 50.0f);  /* Current 2.80 -> Healthy (Green) */
    init_channel(&state->misalignment_st02, 4.30f, 70.0f, 75.0f);  /* Current 4.30 -> Healthy (Green) */

    /* 2. Weigh Station & Load Sensor (HX711 Strain Gauge ST01 / LOAD_CELL_1.stl) */
    init_channel(&state->load_sensor_st01, 0.41f, 45.0f, 55.0f);   /* Frame joint stress baseline 0.41 kg -> Healthy (Green) */
    init_channel(&state->thickness_st01, 22.81f, 15.0f, 10.0f);    /* Belt cover thickness: 22.81 mm */
    init_channel(&state->load_cell_st01, 0.0f, 250.0f, 320.0f);

    /* 3. Tachometer Speeds */
    init_channel(&state->speed_tail_st01, 0.84f, 2.0f, 1.5f);
    init_channel(&state->speed_mid_st02, 0.85f, 2.0f, 1.5f);      /* Current 0.85 -> Healthy (Green) */
    init_channel(&state->speed_head_drive, 0.88f, 3.5f, 4.0f);    /* Current 0.88 -> Healthy (Green) */

    /* 4. Bearing Thermal */
    init_channel(&state->temp_bearing_st01, 26.5f, 65.0f, 80.0f); /* Current 26.5 -> Healthy (Green) */

    /* 5. Surface Rip / Damage */
    state->damage_rip_count = 1;
    state->damage_status = SEVERITY_NORMAL;

    /* 6. Electrical Power */
    init_channel(&state->motor_current_st01, 18.4f, 25.0f, 32.0f);

    /* 7. Vibration Accelerometers */
    init_channel(&state->vibration_head, 1.45f, 2.8f, 4.5f);
    init_channel(&state->vibration_tail, 1.12f, 2.8f, 4.5f);
    init_channel(&state->vibration_mid1, 0.95f, 2.8f, 4.5f);
    init_channel(&state->vibration_mid2, 1.05f, 2.8f, 4.5f);

    /* Initial Health Allocation (ABB Screenshot: 70% Good, 10% Warn, 20% Crit) */
    state->health_optimal_pct = 70.0f;
    state->health_warning_pct = 10.0f;
    state->health_critical_pct = 20.0f;

    strncpy(state->active_alert_banner, "Misalignment ST02 above the alert limit (> 71.199997 mm)", sizeof(state->active_alert_banner) - 1);
    strncpy(state->active_alert_tag, "MisST02Attention", sizeof(state->active_alert_tag) - 1);
    state->system_max_severity = SEVERITY_CRITICAL;
}

void telemetry_update_channel(SensorChannel_t* ch, float raw_value) {
    if (!ch) return;
    ch->raw_value = raw_value;

    /* Ring buffer moving average */
    ch->buffer[ch->buffer_idx] = raw_value;
    ch->buffer_idx = (ch->buffer_idx + 1) % FILTER_WINDOW_SIZE;

    float sum = 0.0f;
    for (int i = 0; i < FILTER_WINDOW_SIZE; i++) {
        sum += ch->buffer[i];
    }
    ch->filtered_value = sum / (float)FILTER_WINDOW_SIZE;

    /* Threshold Evaluation */
    if (ch->warning_limit < ch->critical_limit) {
        /* Standard High-Alarm (e.g. Temperature, Misalignment, Vibration) */
        if (ch->filtered_value >= ch->critical_limit) {
            ch->status = SEVERITY_CRITICAL;
        } else if (ch->filtered_value >= ch->warning_limit) {
            ch->status = SEVERITY_WARNING;
        } else {
            ch->status = SEVERITY_NORMAL;
        }
    } else {
        /* Low-Alarm (e.g. Thickness wear) */
        if (ch->filtered_value <= ch->critical_limit) {
            ch->status = SEVERITY_CRITICAL;
        } else if (ch->filtered_value <= ch->warning_limit) {
            ch->status = SEVERITY_WARNING;
        } else {
            ch->status = SEVERITY_NORMAL;
        }
    }
}

void telemetry_evaluate_system(ConveyorSystemState_t* state) {
    if (!state) return;

    /* Compute Belt Slip between Head Drive and Tail Drum */
    float head_speed = state->speed_head_drive.filtered_value;
    float tail_speed = state->speed_tail_st01.filtered_value;
    if (head_speed > 0.01f) {
        state->belt_slip_percentage = fabsf(head_speed - tail_speed) / head_speed * 100.0f;
    } else {
        state->belt_slip_percentage = 0.0f;
    }

    /* Aggregate System Health */
    int total_points = 10;
    int normal_count = 0;
    int warning_count = 0;
    int critical_count = 0;

    SensorChannel_t* channels[] = {
        &state->misalignment_st01,
        &state->misalignment_st02,
        &state->thickness_st01,
        &state->load_cell_st01,
        &state->speed_mid_st02,
        &state->speed_head_drive,
        &state->temp_bearing_st01,
        &state->motor_current_st01,
        &state->vibration_head,
        &state->vibration_tail
    };

    AlarmSeverity_t max_sev = SEVERITY_NORMAL;

    for (int i = 0; i < total_points; i++) {
        if (channels[i]->status == SEVERITY_CRITICAL) {
            critical_count++;
            max_sev = SEVERITY_CRITICAL;
        } else if (channels[i]->status == SEVERITY_WARNING) {
            warning_count++;
            if (max_sev < SEVERITY_WARNING) max_sev = SEVERITY_WARNING;
        } else {
            normal_count++;
        }
    }

    state->system_max_severity = max_sev;
    state->health_optimal_pct = ((float)normal_count / (float)total_points) * 100.0f;
    state->health_warning_pct = ((float)warning_count / (float)total_points) * 100.0f;
    state->health_critical_pct = ((float)critical_count / (float)total_points) * 100.0f;

    /* Update Active Alert Banner */
    if (state->misalignment_st02.status >= SEVERITY_WARNING) {
        snprintf(state->active_alert_banner, sizeof(state->active_alert_banner),
                 "Misalignment ST02 above the alert limit (> %.2f mm)", state->misalignment_st02.warning_limit);
        strncpy(state->active_alert_tag, "MisST02Attention", sizeof(state->active_alert_tag) - 1);
    } else if (state->misalignment_st01.status >= SEVERITY_CRITICAL) {
        snprintf(state->active_alert_banner, sizeof(state->active_alert_banner),
                 "CRITICAL: Misalignment ST01 exceeded shutdown tolerance (%.2f mm)", state->misalignment_st01.filtered_value);
        strncpy(state->active_alert_tag, "MisST01Critical", sizeof(state->active_alert_tag) - 1);
    } else {
        strncpy(state->active_alert_banner, "System nominal. All conveyor parameters within safe operational envelope.", sizeof(state->active_alert_banner) - 1);
        strncpy(state->active_alert_tag, "SystemNormal", sizeof(state->active_alert_tag) - 1);
    }
}

int telemetry_export_json(const ConveyorSystemState_t* state, char* buffer, size_t max_len) {
    if (!state || !buffer || max_len == 0) return -1;

    return snprintf(buffer, max_len,
        "{"
        "\"timestamp\":%llu,"
        "\"misalignment_st01\":{\"val\":%.2f,\"status\":%d,\"unit\":\"mm\"},"
        "\"misalignment_st02\":{\"val\":%.2f,\"status\":%d,\"unit\":\"mm\"},"
        "\"load_sensor_st01\":{\"val\":%.2f,\"status\":%d,\"unit\":\"kg\"},"
        "\"thickness_st01\":{\"val\":%.2f,\"status\":%d,\"unit\":\"kg\"},"
        "\"speed_mid_st02\":{\"val\":%.2f,\"status\":%d,\"unit\":\"m/s\"},"
        "\"speed_head_drive\":{\"val\":%.2f,\"status\":%d,\"unit\":\"m/s\"},"
        "\"temp_bearing_st01\":{\"val\":%.1f,\"status\":%d,\"unit\":\"°C\"},"
        "\"damage_st01\":{\"val\":%u,\"status\":%d,\"unit\":\"count\"},"
        "\"motor_current\":{\"val\":%.1f,\"status\":%d,\"unit\":\"A\"},"
        "\"vibration_head\":{\"val\":%.2f,\"status\":%d,\"unit\":\"mm/s\"},"
        "\"belt_slip\":%.1f,"
        "\"health\":{\"optimal\":%.1f,\"warning\":%.1f,\"critical\":%.1f},"
        "\"alert_banner\":\"%s\","
        "\"alert_tag\":\"%s\""
        "}",
        (unsigned long long)state->timestamp_ms,
        state->misalignment_st01.filtered_value, state->misalignment_st01.status,
        state->misalignment_st02.filtered_value, state->misalignment_st02.status,
        state->load_sensor_st01.filtered_value, state->load_sensor_st01.status,
        state->thickness_st01.filtered_value, state->thickness_st01.status,
        state->speed_mid_st02.filtered_value, state->speed_mid_st02.status,
        state->speed_head_drive.filtered_value, state->speed_head_drive.status,
        state->temp_bearing_st01.filtered_value, state->temp_bearing_st01.status,
        state->damage_rip_count, state->damage_status,
        state->motor_current_st01.filtered_value, state->motor_current_st01.status,
        state->vibration_head.filtered_value, state->vibration_head.status,
        state->belt_slip_percentage,
        state->health_optimal_pct, state->health_warning_pct, state->health_critical_pct,
        state->active_alert_banner,
        state->active_alert_tag
    );
}
