import { Button, Typography } from 'antd';
import getQueryResult from 'api/widgets/getQuery';
import { AxiosError } from 'axios';
import { ChartData } from 'chart.js';
import { GraphOnClickHandler } from 'components/Graph';
import Spinner from 'components/Spinner';
import TimePreference from 'components/TimePreferenceDropDown';
import GridGraphComponent from 'container/GridGraphComponent';
import {
	timeItems,
	timePreferance,
	timePreferenceType,
} from 'container/NewWidget/RightContainer/timeItems';
import convertToNanoSecondsToSecond from 'lib/convertToNanoSecondsToSecond';
import getChartData from 'lib/getChartData';
import GetMaxMinTime from 'lib/getMaxMinTime';
import GetMinMax from 'lib/getMinMax';
import getStartAndEndTime from 'lib/getStartAndEndTime';
import getStep from 'lib/getStep';
import React, { useCallback, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { AppState } from 'store/reducers';
import { Widgets } from 'types/api/dashboard/getAll';
import { GlobalReducer } from 'types/reducer/globalTime';

import { NotFoundContainer, TimeContainer } from './styles';

function FullView({
	widget,
	fullViewOptions = true,
	onClickHandler,
	name,
	yAxisUnit,
}: FullViewProps): JSX.Element {
	const { minTime, maxTime, selectedTime: globalSelectedTime } = useSelector<
		AppState,
		GlobalReducer
	>((state) => state.globalTime);

	const [state, setState] = useState<FullViewState>({
		error: false,
		errorMessage: '',
		loading: true,
		payload: undefined,
	});

	const getSelectedTime = useCallback(
		() =>
			timeItems.find((e) => e.enum === (widget?.timePreferance || 'GLOBAL_TIME')),
		[widget],
	);

	const [selectedTime, setSelectedTime] = useState<timePreferance>({
		name: getSelectedTime()?.name || '',
		enum: widget?.timePreferance || 'GLOBAL_TIME',
	});

	const onFetchDataHandler = useCallback(async () => {
		try {
			const maxMinTime = GetMaxMinTime({
				graphType: widget.panelTypes,
				maxTime,
				minTime,
			});

			const getMinMax = (
				time: timePreferenceType,
			): { min: string | number; max: string | number } => {
				if (time === 'GLOBAL_TIME') {
					const minMax = GetMinMax(globalSelectedTime);
					return {
						min: convertToNanoSecondsToSecond(minMax.minTime / 1000),
						max: convertToNanoSecondsToSecond(minMax.maxTime / 1000),
					};
				}

				const minMax = getStartAndEndTime({
					type: selectedTime.enum,
					maxTime: maxMinTime.maxTime,
					minTime: maxMinTime.minTime,
				});
				return { min: parseInt(minMax.start, 10), max: parseInt(minMax.end, 10) };
			};

			const queryMinMax = getMinMax(selectedTime.enum);
			const response = await Promise.all(
				widget.query
					.filter((e) => e.query.length !== 0)
					.map(async (query) => {
						const result = await getQueryResult({
							end: queryMinMax.max.toString(),
							query: query.query,
							start: queryMinMax.min.toString(),
							step: `${getStep({
								start: queryMinMax.min,
								end: queryMinMax.max,
								inputFormat: 's',
							})}`,
						});
						return {
							query: query.query,
							queryData: result,
							legend: query.legend,
						};
					}),
			);

			const isError = response.find((e) => e.queryData.statusCode !== 200);

			if (isError !== undefined) {
				setState((state) => ({
					...state,
					error: true,
					errorMessage: isError.queryData.error || 'Something went wrong',
					loading: false,
				}));
			} else {
				const chartDataSet = getChartData({
					queryData: response.map((e) => ({
						query: e.query,
						legend: e.legend,
						queryData: e.queryData.payload?.result || [],
					})),
				});

				setState((state) => ({
					...state,
					loading: false,
					payload: chartDataSet,
				}));
			}
		} catch (error) {
			setState((state) => ({
				...state,
				error: true,
				errorMessage: (error as AxiosError).toString(),
				loading: false,
			}));
		}
	}, [widget, maxTime, minTime, selectedTime.enum, globalSelectedTime]);

	useEffect(() => {
		onFetchDataHandler();
	}, [onFetchDataHandler]);

	if (state.error && !state.loading) {
		return (
			<NotFoundContainer>
				<Typography>{state.errorMessage}</Typography>
			</NotFoundContainer>
		);
	}

	if (state.loading || state.payload === undefined) {
		return (
			<div>
				<Spinner height="80vh" size="large" tip="Loading..." />
			</div>
		);
	}

	return (
		<>
			{fullViewOptions && (
				<TimeContainer>
					<TimePreference
						{...{
							selectedTime,
							setSelectedTime,
						}}
					/>
					<Button onClick={onFetchDataHandler} type="primary">
						Refresh
					</Button>
				</TimeContainer>
			)}

			{/* <GraphContainer> */}
			<GridGraphComponent
				{...{
					GRAPH_TYPES: widget.panelTypes,
					data: state.payload,
					isStacked: widget.isStacked,
					opacity: widget.opacity,
					title: widget.title,
					onClickHandler,
					name,
					yAxisUnit,
				}}
			/>
			{/* </GraphContainer> */}
		</>
	);
}

interface FullViewState {
	loading: boolean;
	error: boolean;
	errorMessage: string;
	payload: ChartData | undefined;
}

interface FullViewProps {
	widget: Widgets;
	fullViewOptions?: boolean;
	onClickHandler?: GraphOnClickHandler;
	name: string;
	yAxisUnit?: string;
}

FullView.defaultProps = {
	fullViewOptions: undefined,
	onClickHandler: undefined,
	yAxisUnit: undefined,
};

export default FullView;
