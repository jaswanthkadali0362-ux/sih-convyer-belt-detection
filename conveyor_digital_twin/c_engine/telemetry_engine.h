/**
 * @file telemetry_engine.h
 * @brief Industrial Conveyor Condition Monitoring & Telemetry Processing Core
 * Conforms to IEC 62443 / ISA-101 Industrial Condition Monitoring Standards
 */

#ifndef TELEMETRY_ENGINE_H
#define TELEMETRY_ENGINE_H

#ifdef __cplusplus
extern "C" {
#endif

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

/* Alarm Severity Classification */
typedef enum {
    SEVERITY_NORMAL = 0,
    SEVERITY_WARNING = 1,
    SEVERITY_CRITICAL = 2
} AlarmSeverity_t;

/* Ring buffer size for moving average filtering */
#define FILTER_WINDOW_SIZE 16

/* 13 Sensor Physical Telemetry Structs */
typedef struct {
    float raw_value;
    float filtered_value;
    float buffer[FILTER_WINDOW_SIZE];
    uint8_t buffer_idx;
    float warning_limit;
    float critical_limit;
    AlarmSeverity_t status;
} SensorChannel_t;

typedef struct {
    uint64_t timestamp_ms;
    
    /* 1. Misalignment Sensors (ToF ST01 & ST02) */
    SensorChannel_t misalignment_st01; /* Return strand lateral drift (mm) */
    SensorChannel_t misalignment_st02; /* Carrying strand lateral drift (mm) */

    /* 2. Weigh Station & Load Sensor (HX711 Strain Gauge ST01 / LOAD_CELL_1.stl) */
    SensorChannel_t load_sensor_st01;  /* Belt load cell / weigh station (kg) */
    SensorChannel_t thickness_st01;    /* Alias for load sensor channel */
    SensorChannel_t load_cell_st01;    /* Belt tension / material load (kg) */

    /* 3. Tachometer Speed Sensors */
    SensorChannel_t speed_tail_st01;   /* Tail pulley speed (m/s) */
    SensorChannel_t speed_mid_st02;    /* Carrying strand speed (m/s) */
    SensorChannel_t speed_head_drive;  /* Head drive drum speed (m/s) */
    float belt_slip_percentage;        /* Head vs Tail speed slip ratio */

    /* 4. Thermal Sensor */
    SensorChannel_t temp_bearing_st01; /* Drive bearing temperature (°C) */

    /* 5. Optical Surface Damage (Depth Camera ST01) */
    uint32_t damage_rip_count;
    AlarmSeverity_t damage_status;

    /* 6. Electrical Power */
    SensorChannel_t motor_current_st01;/* Stator current (Amperes) */

    /* 7. Tri-axial Vibration Accelerometers */
    SensorChannel_t vibration_head;    /* Drive head RMS (mm/s) */
    SensorChannel_t vibration_tail;    /* Tail tension RMS (mm/s) */
    SensorChannel_t vibration_mid1;    /* Mid idler 1 RMS (mm/s) */
    SensorChannel_t vibration_mid2;    /* Mid idler 2 RMS (mm/s) */

    /* System Health Aggregation (ABB Ability Donut Chart) */
    float health_optimal_pct;          /* e.g. 70.0% */
    float health_warning_pct;          /* e.g. 10.0% */
    float health_critical_pct;         /* e.g. 20.0% */

    /* Active Alarm Description & Quick Tag */
    char active_alert_banner[128];
    char active_alert_tag[32];
    AlarmSeverity_t system_max_severity;
} ConveyorSystemState_t;

/* Function Declarations */
void telemetry_init(ConveyorSystemState_t* state);
void telemetry_update_channel(SensorChannel_t* channel, float raw_value);
void telemetry_evaluate_system(ConveyorSystemState_t* state);
int telemetry_export_json(const ConveyorSystemState_t* state, char* buffer, size_t max_len);

#ifdef __cplusplus
}
#endif

#endif /* TELEMETRY_ENGINE_H */
